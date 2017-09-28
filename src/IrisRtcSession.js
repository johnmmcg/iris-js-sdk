// Copyright 2016 Comcast Cable Communications Management, LLC

// IrisRtcSession.js : Javascript code for managing calls/sessions for audio, video and PSTN

// Defining the API module 
module.exports = IrisRtcSession;

// Import the modules
var uuidV1 = require('uuid/v1');
var async = require("async");
var Interop = require('sdp-interop').Interop;
var logger = require('./modules/RtcLogger.js');
var errors = require('./modules/RtcErrors.js');
var rtcConfig = require('./modules/RtcConfig.js');
var rtcStats = require('./modules/RtcStats.js');
var RtcEvents = require("./modules/RtcEvents.js").Events;
var SDP = require('./modules/Utils/SDP.js');
var SDPUtil = require("./modules/Utils/SDPUtil.js");
var SDPDiffer = require('./modules/Utils/SDPDiffer.js');
var RtcBrowserType = require("./modules/Utils/RtcBrowserType.js");
var SDPMangler = require('./modules/Utils/SDPMangler.js');
var RestHelper = require('./modules/Utils/RtcRestHelper.js');
var WebRTC = require('./modules/RtcWebrtcAdapter.js');

// States
["NONE", "CONNECTING", "OUTGOING", "INCOMING", "INPROGRESS", "CONNECTED",
    "PRESENCE_NONE", "PRESENCE_JOINED", "PRESENCE_JOINED_MODERATOR"
].forEach(function each(state, index) {
    IrisRtcSession.prototype[state] = IrisRtcSession[state] = index;
});

/**
 * Constructor for IrisRtcSession.</br>
 * This class maintains APIs required for creating session for video call, audio call.
 * Handles session related events and callbacks.
 * @constructor
 */
function IrisRtcSession() {
    if (this instanceof IrisRtcSession === false) {
        throw new TypeError("Classes can't be function-called");
    }

    logger.log(logger.level.INFO, "IrisRtcSession",
        " Constructor ");
    this.state = IrisRtcSession.NONE;
    this.config = null;
    this.connection = null;
    this.participants = {};
    this.peerconnection = null;
    this.stream = null;
    this.localSdp = null;
    this.jid = null;
    this.candidates = [];
    this.to = null;
    this.focusJid = null;
    this.presenceState = IrisRtcSession.PRESENCE_NONE;
    this.pstnState = IrisRtcSession.NONE;
    this.ssrcOwners = {};
    this.localStream = null;
    this.dataChannels = [];
    this.dataChannel = null;
    this.isVideoMuted = false;
    this.isAudioMuted = false;
    this.sessionInitiateSdp = null;
    // Add the entry
    this.interop = new Interop();
    // Stats Init
    this.sdkStats = new rtcStats(this.config);

    this.addSourcesQueue = async.queue(this.addSourceFF.bind(this), 1);
    this.addSourcesQueue.pause();
    this.startPresenceMonitor = true;
    this.chatState = null;
}

/**
 * Entry point for creating the session
 * @param {json} config - type, routingId, publicId, roomId
 * @param {object} connection - a IRIS RTC Connection object to send messages
 * @private
 */
IrisRtcSession.prototype.create = function(config, connection) {

    logger.log(logger.level.VERBOSE, "IrisRtcSession",
        " Create session with config " + JSON.stringify(config));

    // Parameter checking
    if (!config || !config.type || !config.routingId || !connection) {
        logger.log(logger.level.ERROR, "IrisRtcSession",
            " Create failed, incorrect parameters ");
        return errors.code.ERR_INCORRECT_PARAMETERS;
    }

    // Assign self
    var self = this;
    this.config = config; //Object.assign({}, config);
    this.connection = connection;

    // Add traceid
    if (!this.config.traceId || this.config.traceId == "") {
        this.config.traceId = this.getUUIDV1();
    }

    this.config.presenceType = "join";

    if (!self.localStream) {
        this.config.audiomuted = "true";
        this.config.videomuted = "true";
    } else {
        this.config.audiomuted = "false";
        this.config.videomuted = "false";
    }
    this.updateEventType();

    logger.log(logger.level.INFO, "IrisRtcSession",
        " create " + JSON.stringify(this.config));

    if (this.config.type != "chat") {
        // Init webrtc
        // Create peerconnection now
        self.initWebRTC(connection.iceServerJson, this.config.type);

        // Add stream to peer connection
        self.addStream(self.localStream);
    }

    // Create a DTMF Manager
    if (self.peerconnection && self.localStream && self.localStream.getAudioTracks() && self.config.useDTMF) {
        var audiotracks = self.localStream.getAudioTracks();
        if (audiotracks) {
            for (var i = 0; i < audiotracks.length; i++) {
                DTMFManager(self, audiotracks[i], self.peerconnection);
            }
        }
    }



    if (config.sessionType != "join" || (config.sessionType == "join" && config.type == "chat" && !config.rtcServer)) {
        self.sendEvent("SDK_StartMucRequest", { message: "Start Muc for create session or joining chat session" });
        self.sendStartMucWithRoomId(self.config);
    } else {
        // Send the presence directly
        self.config.rootNodeId = "00000"; //TBD
        self.config.childNodeId = "00000";

        // Set the state to CONNECTING
        self.state = IrisRtcSession.CONNECTING;

        if ((self.config.useBridge || (self.config.type == "pstn")) && self.config.type != "chat") {
            if (!self.config.channelLastN)
                self.config.channelLastN = rtcConfig.json.channelLastN;

            // Send the allocate room request
            connection.xmpp.sendAllocate(self.config);
        } else {
            // Send the presence if room is created
            connection.xmpp.sendPresence(self.config);
        }
    }

    connection.xmpp.on(self.config.roomId, function(event, response) {

        logger.log(logger.level.INFO, "IrisRtcSession",
            " Room : " + self.config.roomId + " Event : " + event + " response : " + JSON.stringify(response));

        if (self.config.roomId != response.roomId) {
            logger.log(logger.level.ERROR, "IrisRtcSession", "RoomId mismatch : Listening event to " +
                self.config.roomId + " Received event for " + response.roomId);
            return;
        }

        if (event === "onAllocateSuccess") {

            logger.log(logger.level.VERBOSE, "IrisRtcSession",
                " onAllocateSuccess " + response.focusJid);

            self.focusJid = response.focusJid;

            // Send the presence if room is created
            connection.xmpp.sendPresence(self.config);

            // Send presence Alive
            connection.xmpp.sendPresenceAlive(self.config);


        } else if (event === "onCapabilityRequest") {
            logger.log(logger.level.VERBOSE, "IrisRtcSession",
                " Received capability request"
            );

            // Send the capability
            var data = {
                "to": response.from,
                "id": response.id,
                "traceId": self.config.traceId,
            };
            // Call the session-initiate api
            connection.xmpp.sendCapabilities(data);


        } else if (event === "onPresence") {
            logger.log(logger.level.VERBOSE, "IrisRtcSession",
                " onPresence " + JSON.stringify(response));

            if (Object.keys(self.participants).length > 0) {
                if (self.participants[response.jid] != null) {
                    self.participants[response.jid].lastPresenceReceived = new Date();
                }
            }
            var found = false;

            if (!self.connection) return;

            if ((response.jid == self.connection.myJid) &&
                (response.roomId == self.config.roomId)) {
                if (response.type == "join") {
                    if (self.presenceState == IrisRtcSession.PRESENCE_JOINED) {
                        // This is just an update so ignore

                        // Check if we have become moderator
                        if (response.role == "moderator" && self.config.focusJid) {
                            // What to do?
                        }
                        if (response.videomuted) {
                            self.onVideoMuted(response.jid, response.videomuted);
                        }
                        if (response.audiomuted) {
                            self.onAudioMuted(response.jid, response.audiomuted);
                        }
                        if (response.nick) {
                            self.onDisplayNameChange(response.jid, response.nick);
                        }
                        return;
                    }

                    if (self.presenceState !== IrisRtcSession.PRESENCE_JOINED) {
                        self.onJoined(response.roomId, response.jid);
                    }
                    self.presenceState = IrisRtcSession.PRESENCE_JOINED;

                    logger.log(logger.level.INFO, "IrisRtcSession",
                        " onPresence " + JSON.stringify(response));


                    // Send events
                    self.sendEvent("SDK_XMPPJoined", { myJid: response.jid });

                    // for audio call, send the rayo command
                    if (self.config.type == "pstn" && self.config.sessionType != "join" && self.pstnState == IrisRtcSession.NONE) {
                        self.pstnState = IrisRtcSession.INPROGRESS;
                        // send the rayo command
                        connection.xmpp.sendRayo(self.config);
                    }

                    /* Stats Init Begin*/
                    var statsOptions = {
                        wsServer: connection.xmppServer,
                        rtcServer: self.config.rtcServer,
                        roomId: self.config.roomId,
                        routingId: self.config.routingId,
                        traceId: self.config.traceId,
                        UEStatsServer: rtcConfig.json.urls.UEStatsServer,
                        sdkVersion: rtcConfig.json.sdkVersion,
                        UID: self.config.publicId ? self.config.publicId : self.config.routingId,
                        useBridge: self.config.useBridge
                    };

                    self.sdkStats.options = statsOptions;
                    self.sdkStats.localStatInterval = 2000;
                    self.sdkStats.getPeerStats(self.peerconnection, rtcConfig.json.statsInterval, true);
                    /* Stats Init End*/

                    // Check the state
                    if (self.state == IrisRtcSession.CONNECTING) {
                        logger.log(logger.level.INFO, "IrisRtcSession",
                            " send onCreated ");

                        // We were the first ones to join so go with createoffer flow
                        // Only for non bridge case we generate the offer first
                        if (!self.config.useBridge && (self.config.sessionType != "join") && (self.config.type != "pstn")) {
                            self.state = IrisRtcSession.OUTGOING;
                            try {
                                self.createOffer(self.config.type);
                            } catch (e) {
                                logger.log(logger.level.ERROR, "IrisRtcSession",
                                    " createOffer exception " + e);
                            }
                        }
                    }
                } else if (response.type == "unavailable") {

                    Object.keys(self.participants).forEach(function(jid) {
                        if (jid == response.jid) {
                            delete self.participants[jid];
                        }
                    });

                    var closeSession = false;
                    if (self.participants && Object.keys(self.participants).length == 0) {
                        closeSession = true; // Close session if all participants left
                    }

                    self.onParticipantLeft(response.roomId, response.jid, closeSession);
                    // Send events
                    self.sendEvent("SDK_XMPPOccupantLeft", { participantJid: response.jid });
                }
            } else if (response.roomId == self.config.roomId) {
                if (response.type == "join") {
                    found = false;
                    Object.keys(self.participants).forEach(function(jid) {
                        if (jid == response.jid) {
                            found = true;
                        }

                    });

                    if (!found) {
                        if (response.jid.indexOf('f0cus') > 0) {

                            if (!self.config.focusJid) {
                                // Send events
                                self.sendEvent("SDK_XMPPFocusJoined", { focusJid: response.jid });
                            }

                            // Change the focus jid
                            self.config.focusJid = response.jid;

                            logger.log(logger.level.INFO, "IrisRtcSession",
                                " onPresence " + JSON.stringify(response));


                            // Set the state to INCOMING
                            self.state = IrisRtcSession.INCOMING;

                            // Send the capability
                            var data = {
                                "to": response.from,
                                "rootNodeId": self.config.rootNodeId,
                                "childNodeId": self.config.childNodeId,
                                "traceId": self.config.traceId,
                                "roomId": self.config.roomId,
                                "eventType": self.config.eventType
                            };
                            self.connection.xmpp.requestCapabilities(data);
                        } else {
                            self.jid = response.jid;

                            self.participants[response.jid] = { "jid": response.jid };

                            self.onParticipantJoined(response.roomId, response.jid);
                            self.participants[response.jid].eventType = response.dataElement.event;

                            if (self.config.type != "pstn") {
                                self.participants[response.jid].lastPresenceReceived = new Date();

                                if (self.startPresenceMonitor) {
                                    self.startPresenceMonitor = false;
                                    self.presenceMonitor();
                                }
                            }

                            logger.log(logger.level.INFO, "IrisRtcSession",
                                " onPresence " + JSON.stringify(response));

                            // Send events
                            self.sendEvent("SDK_XMPPOccupantJoined", { participantJid: response.jid });

                            // Send the capability
                            var data = {
                                "to": response.from,
                                "rootNodeId": self.config.rootNodeId,
                                "childNodeId": self.config.childNodeId,
                                "traceId": self.config.traceId,
                                "roomId": self.config.roomId,
                                "eventType": self.config.eventType
                            };
                            self.connection.xmpp.requestCapabilities(data);
                        }

                    }

                    if (response.videomuted) {
                        self.onVideoMuted(response.jid, response.videomuted);
                    }
                    if (response.audiomuted) {
                        self.onAudioMuted(response.jid, response.audiomuted);
                    }
                    if (response.nick) {
                        self.onDisplayNameChange(response.jid, response.nick);
                    }
                    if (response.status) {
                        self.onUserStatusChange(response.jid, response.status);
                    }

                    if (response.dataElement && response.dataElement.event) {
                        if (self.participants[response.jid] && self.participants[response.jid].eventType != response.dataElement.event) {
                            self.participants[response.jid].eventType = response.dataElement.event;
                            logger.log(logger.level.INFO, "IrisRtcSession", "onPresence ::" +
                                "onSessionTypeChange:: type : " + response.dataElement.event + " participant :: " + response.jid);
                            if (self.config.eventType != response.dataElement.event) {

                                var eventType = response.dataElement.event;

                                eventType = (eventType == "groupchat") ? "chat" : (eventType == "videocall") ? "video" :
                                    (eventType == "audiocall") ? "audio" : (eventType == "pstncall") ? "pstn" : "";

                                self.onSessionTypeChange(self.config.roomId, response.jid, eventType);
                            }
                        }
                    }

                    // Check the state
                    if (self.state == IrisRtcSession.CONNECTING) {
                        // We were the first ones to join so go with set remote description flow
                        self.state = IrisRtcSession.INCOMING;
                    }

                    // Send the offer
                    if (self.state == IrisRtcSession.OUTGOING) {
                        // Check if it is already generated
                        if (self.localSdp) {
                            // Send the offer
                            var data = {
                                "sdp": self.localSdp,
                                "to": response.jid,
                                "traceId": self.config.traceId,
                                "roomId": self.config.roomId,
                                "rtcServer": self.config.rtcServer
                            };
                            // Call the session-initiate api
                            self.connection.xmpp.sendSessionInitiate(data);
                            // Send events
                            self.sendEvent("SDK_XMPPJingleSessionInitiateSent", { message: "Sending session-initate" });

                        }
                    }
                } else if (response.type == "unavailable") {

                    Object.keys(self.participants).forEach(function(jid) {
                        if (jid == response.jid) {
                            delete self.participants[jid];
                        }

                    });
                    var closeSession = false;
                    if (self.participants && Object.keys(self.participants).length == 0) {
                        closeSession = true; // Close session if all participants left
                    }

                    self.onParticipantLeft(response.roomId, response.jid, closeSession);
                    // Send events
                    self.sendEvent("SDK_XMPPOccupantLeft", { participantJid: response.jid });
                }
            }
        } else if (event === "onPresenceError") {
            logger.log(logger.level.VERBOSE, "IrisRtcSession",
                " onPresenceError " + error);

            self.sendEvent("SDK_PresenceError", { message: "Error in presence message" });

            self.onError(self.config.roomId, error);
        } else if (event === "onCandidate") {

            // Send events
            self.sendEvent("SDK_XMPPTransportInfoReceived", response.line);
            logger.log(logger.level.VERBOSE, "IrisRtcSession",
                " onCandidate " + " roomId " + response.roomId +
                " with data " + JSON.stringify(response) +
                "config.roomId " + config.roomId);
            // Check if this is the correct session
            if (response.roomId != self.config.roomId) return;

            if (self.peerconnection != null) {
                try {
                    // Create the candidate
                    var candidate = new WebRTC.RTCIceCandidate({
                        "sdpMLineIndex": response.sdpMLineIndex,
                        "sdpMid": response.sdpMid,
                        "candidate": response.line
                    });

                    // Addice candidate
                    self.peerconnection.addIceCandidate(candidate);
                } catch (e) {
                    logger.log(logger.level.ERROR, "IrisRtcSession",
                        " error adding candidate  " + e);
                }
            } else {
                logger.log(logger.level.ERROR, "IrisRtcSession", "Peer connection is null, adding ice candidate failed");
            }
        } else if (event === "onSessionInitiate") {

            // Send events
            self.sendEvent("SDK_XMPPJingleSessionInitiateReceived", { message: "Session-initiate receieved" });

            logger.log(logger.level.VERBOSE, "IrisRtcSession",
                " onSessionInitiate " + " roomId " + response.roomId + " config.roomId " + self.config.roomId);

            // Check if this is the correct session
            if (response.roomId != self.config.roomId) return;

            self.sessionInitiateSdp = response.remoteSDP;

            // Check if we were supposed to receive this
            if (self.state == IrisRtcSession.INCOMING) {
                if (self.peerconnection != null) {
                    // Check the current state of peerconnection: TBD
                    logger.log(logger.level.INFO, "IrisRtcSession",
                        " Calling setRemoteDescription with  " + response.sdp +
                        " peerconnection " + self.peerconnection.signalingState);
                    var desc = new RTCSessionDescription({ "sdp": response.sdp, "type": "offer" });

                    self.state = IrisRtcSession.INPROGRESS;
                    self.to = response.from;
                    self.setOffer(desc, response.from);
                    self.readSsrcs(response);
                } else {
                    logger.log(logger.level.ERROR, "IrisRtcSession", "Failed to set session-initiate as peerconnection is null");
                }
            } else {
                logger.log(logger.level.ERROR, "IrisRtcSession",
                    " Ignoring session-initiate as state is " + self.state);
            }
        } else if (event === "onSessionAccept") {
            // Send events
            self.sendEvent("SDK_XMPPJingleSessionAcceptReceived", { message: "Session-accept received" });

            logger.log(logger.level.VERBOSE, "IrisRtcSession",
                " onSessionAccept " + " roomId " + response.roomId + " config.roomId " + self.config.roomId);

            // Check if this is the correct session
            if (response.roomId != self.config.roomId) return;

            // Check if we were supposed to receive this
            if (self.state == IrisRtcSession.OUTGOING) {

                if (self.peerconnection != null) {
                    // Check the current state of peerconnection: TBD
                    logger.log(logger.level.INFO, "IrisRtcSession",
                        " Calling setRemoteDescription with  " + response.sdp +
                        " peerconnection " + self.peerconnection.signalingState);
                    var desc = new RTCSessionDescription({ "sdp": response.sdp, "type": "answer" });

                    self.state = IrisRtcSession.INPROGRESS;
                    self.to = response.from;
                    self.setAnswer(desc, response.from);

                    // send the candidates
                    process.nextTick(function() {
                        // send the candidates
                        self.sendCandidates();
                    });
                } else {
                    logger.log(logger.level.ERROR, "IrisRtcSession", "Failed to set session accept as peerconnection is null");
                }
            } else {
                logger.log(logger.level.ERROR, "IrisRtcSession",
                    " Ignoring session-initiate as state is " + self.state);
            }
        } else if (event === "onSourceAdd") {

            logger.log(logger.level.VERBOSE, "IrisRtcSession",
                " onSourceAdd " + " roomId " + response.roomId + " config.roomId " + self.config.roomId);

            self.sendEvent("SDK_XMPPJingleSourceAddReceived", { message: "Source-add received" });

            // Check if this is the correct session
            if (response.roomId != self.config.roomId) return;

            // Check if we were supposed to receive this
            if (self.peerconnection != null) {

                if (self.sessionInitiateSdp == null) {
                    return;
                }

                self.sessionInitiateSdp.addSources(response.jingle);

                response.sdp = self.sessionInitiateSdp.raw;


                // Check the current state of peerconnection: TBD
                logger.log(logger.level.INFO, "IrisRtcSession",
                    " Calling setRemoteDescription with  " + response.sdp +
                    " \npeerconnection " + self.peerconnection.signalingState);
                //var desc = new RTCSessionDescription({ "sdp": response.sdp, "type": "offer" });

                // self.setReOffer(response);
                // self.readSsrcs(response);


                if (RtcBrowserType.isFirefox()) {
                    logger.log(logger.level.VERBOSE, "IrisRtcSession", "addSourcesQueue :: Call addSourceFF");
                    // self.addSourceFF(response);

                    // self.dataNew = response;

                    // var localsdp_new = self.interop.toPlanB(self.peerconnection.localDescription);
                    // var old_sdp = new SDP(localsdp_new.sdp);

                    self.addSourcesQueue.push(response, function(old_sdp) {
                        logger.log(logger.level.VERBOSE, "IrisRtcSession", "addSourcesQueue Done");

                        logger.log(logger.level.VERBOSE, "IrisRtcSession", "addSourcesQueue Done old_sdp :" + old_sdp);

                        var localsdp_new = self.interop.toPlanB(self.peerconnection.localDescription);
                        var new_sdp = new SDP(localsdp_new.sdp);
                        var sdpDiffer = new SDPDiffer(old_sdp, new_sdp);
                        logger.log(logger.level.VERBOSE, "IrisRtcSession", "addSourcesQueue Done new_sdp : " + new_sdp);

                        var dataAdd = {
                            "to": self.to,
                            "traceId": self.config.traceId,
                        };
                        logger.log(logger.level.VERBOSE, "IrisRtcSession", "addSourcesQueue Done dataAdd : " + dataAdd);

                        self.connection.xmpp.sendSourceAdd(sdpDiffer, dataAdd);
                    });
                } else {

                    self.setReOffer(response);
                }
                self.readSsrcs(response);

                // if (RtcBrowserType.isChrome() || (RtcBrowserType.isFirefox() && self.participants.length >= 2)) {
                //     self.setReOffer(desc, response.from);
                //     self.readSsrcs(response);
                // } else {
                //     logger.log(logger.level.VERBOSE, "IrisRtcSession", "Not setting ReOffer");
                //     return;
                // }

            } else {
                logger.log(logger.level.ERROR, "IrisRtcSession", "Failed to set source add as peerconnection is null");
            }
        } else if (event === "onSourceRemove") {

            logger.log(logger.level.VERBOSE, "IrisRtcSession",
                " onSourceRemove " + " roomId " + response.roomId + " config.roomId " + self.config.roomId);

            self.sendEvent("SDK_XMPPJingleSourceRemovedReceived", { message: "Source-remove received" });

            // Check if this is the correct session
            if (response.roomId != self.config.roomId) return;

            // Check if we were supposed to receive this
            if (self.peerconnection != null) {

                // self.sessionInitiateSdp.removeSources(response.jingle);
                response.sdp = self.sessionInitiateSdp.raw;

                // Check the current state of peerconnection: TBD
                logger.log(logger.level.INFO, "IrisRtcSession", " onSourceRemove :: Calling setRemoteDescription with  " + response.sdp +
                    " peerconnection " + self.peerconnection.signalingState);

                var remoteDesc = new SDP(self.peerconnection.remoteDescription.sdp);

                var newRemoteDesc = SDPUtil.removeSources(response.jingle, remoteDesc);

                self.setReOfferForSourceRemove(newRemoteDesc);
            } else {
                logger.log(logger.level.ERROR, "IrisRtcSession", "Failed to set source remove as peerconnection is null");
            }

            // Event listener for mute or unmute events
            // mute - true - Mute the local video
            // mute - false - Unmute the local video
        } else if (event === "onVideoMute") {
            logger.log(logger.level.VERBOSE, "IrisRtcSession",
                " onVideoMute " + " mute " + response.mute);

            if (self.localStream) {
                if ((response && !self.isVideoMuted) || (!response.mute && self.isVideoMuted)) {
                    self.videoMuteToggle(self.config.roomId);
                }
            }

            // Event listener for mute or unmute events
            // mute - true - Mute the local audio
            // mute - false - Unmute the local audio
        } else if (event === "onAudioMute") {
            logger.log(logger.level.VERBOSE, "IrisRtcSession",
                " onAudioMute " + " mute " + response.mute);
            if (self.localStream) {
                if ((response && !self.isAudioMuted) || (!response.mute && self.isAudioMuted)) {
                    self.audioMuteToggle(self.config.roomId);
                }
            }

            // Event listener for group chat messages
        } else if (event === "onGroupChatMessage") {
            logger.log(logger.level.VERBOSE, "IrisRtcSession",
                " onGroupChatMessage " + " message " + JSON.stringify(response));

            self.onChatMessage(self.config.roomId, response);

            // Event listener for chat ack messages
        } else if (event === "onChatAck") {
            logger.log(logger.level.VERBOSE, "IrisRtcSession",
                " onChatAck " + " id " + response.id + " Status " + response.statusMessage);
            self.onChatAck(self.config.roomId, response);

        } else if (event === "onChatState") {

            logger.log(logger.level.VERBOSE, "IrisRtcSession",
                " onChatState " + " from : " + response.from + " Chat State : " + response.chatState);

            self.onChatState(self.config.roomId, response.from, response.chatState);

        } else if (event === "onIQError") {

            logger.log(logger.level.VERBOSE, "IrisRtcSession",
                " onIQError " + " Error : " + response.error);

            self.onError(self.config.roomId, response.error);
        }
    });
};

/**
 * @private
 */
IrisRtcSession.prototype.sendStartMucWithRoomId = function(config) {
    var self = this;
    RestHelper.Evm.sendStartMucWithRoomId(config, function(response) {
            logger.log(logger.level.INFO, "IrisRtcSession",
                " START_MUC_SUCCESS " + JSON.stringify(response));

            if (self.state == IrisRtcSession.CONNECTING) return;

            // Send events
            self.sendEvent("SDK_StartMucResponse", response);

            // Get the EM room id
            self.config.rootNodeId = response.root_node_id;
            self.config.childNodeId = response.child_node_id;
            self.config.roomId = response.eventdata.room_id;
            self.config.roomtoken = response.eventdata.room_token;
            self.config.roomtokenexpirytime = response.eventdata.room_token_expiry_time;

            if (!self.config.rtcServer) {
                self.config.rtcServer = response.eventdata.rtc_server;
            }

            if (self.config.useBridge && (self.config.sessionType == "upgrade" || self.config.sessionType == "downgrade")) {
                self.state = IrisRtcSession.INCOMING;
            } else {
                // Set the state to CONNECTING
                self.state = IrisRtcSession.CONNECTING;
            }

            if ((self.config.useBridge || self.config.type == "pstn" || self.config.sessionType == "downgrade" ||
                    self.config.sessionType == "upgrade") && (self.config.type != "chat")) {
                if (!self.config.channelLastN)
                    self.config.channelLastN = rtcConfig.json.channelLastN;

                // Send the allocate room request
                self.connection.xmpp.sendAllocate(self.config);
            } else {
                // Send the presence if room is created
                self.connection.xmpp.sendPresence(self.config);
            }

            self.onCreated(response.eventdata.room_id);
        },
        function(error) {
            logger.log(logger.level.INFO, "IrisRtcSession", "StartMuc Failed with error ", error);
        });
}

/**
 * @private
 */
IrisRtcSession.prototype.sendRootEventWithRoomId = function(config) {
    var self = this;
    RestHelper.Evm.sendRootEventWithRoomId(config, function(response) {
            logger.log(logger.level.INFO, "IrisRtcSession",
                " onCreateRootEventWithRoomIdSent " + JSON.stringify(response));

            if (self.state == IrisRtcSession.CONNECTING) return;

            // Send events
            self.sendEvent("SDK_RootEventResponse", response);

            self.config.rootNodeId = response.root_node_id;
            self.config.childNodeId = response.child_node_id;
            self.config.roomId = response.eventdata.room_id;
            self.config.roomtoken = response.eventdata.room_token;
            self.config.roomtokenexpirytime = response.eventdata.room_token_expiry_time;

            if (!self.config.rtcServer) {
                self.config.rtcServer = response.rtc_server;
            }

            if (self.config.useBridge && (self.config.sessionType == "upgrade" || self.config.sessionType == "downgrade")) {
                self.state = IrisRtcSession.INCOMING;
            } else {
                // Set the state to CONNECTING
                self.state = IrisRtcSession.CONNECTING;
            }

            if ((self.config.useBridge || self.config.type == "pstn" || self.config.sessionType == "downgrade" ||
                    self.config.sessionType == "upgrade") && (self.config.type != "chat")) {
                if (!self.config.channelLastN)
                    self.config.channelLastN = rtcConfig.json.channelLastN;
                // Send the allocate room request
                self.connection.xmpp.sendAllocate(self.config);
            } else {
                // Send the presence if room is created
                self.connection.xmpp.sendPresence(self.config);
            }

            self.onCreated(response.eventdata.room_id);

        },
        function(error) {
            logger.log(logger.level.INFO, "IrisRtcSession", "Root event failed with  ", error);
        });

}

/**
 * Mute remote participant's video
 * @param {string} roomId - Unique Id for participants in a room
 * @param {string} jid - Remote participant's id
 * @param {boolean} mute - true -> mute, false -> unmute
 * @public
 */
IrisRtcSession.prototype.muteParticipantVideo = function(roomId, jid, mute) {
    try {
        if (this.config && roomId != this.config.roomId) {
            logger.log(logger.level.ERROR, "IrisRtcSession", "muteParticipantVideo :: Wrong roomId, this roomId : " +
                this.config.roomId + " Received roomId : " + roomId);
            return;
        }

        if (jid && this.connection && this.connection.xmpp) {
            this.connection.xmpp.sendVideoMute(jid, mute, this.config);
        }
    } catch (error) {
        logger.log(logger.level.ERROR, "IrisRtcSession", "muteParticipantVideo error ", error);
    }
};

/**
 * Mute remote participant's audio
 * @param {string} roomId - Unique Id for participants in a room
 * @param {string} jid - Remote participant's id
 * @param {boolean} mute - true -> mute, false -> unmute
 * @public
 */
IrisRtcSession.prototype.muteParticipantAudio = function(roomId, jid, mute) {
    try {

        if (this.config && roomId != this.config.roomId) {
            logger.log(logger.level.ERROR, "IrisRtcSession", "muteParticipantAudio :: Wrong roomId, this roomId : " +
                this.config.roomId + " Received roomId : " + roomId);
            return;
        }

        if (jid && this.connection && this.connection.xmpp) {
            this.connection.xmpp.sendAudioMute(jid, mute, this.config);
        }
    } catch (error) {
        logger.log(logger.level.ERROR, "IrisRtcSession", "muteParticipantAudio error ", error);
    }
};

/**
 * This API is called to send a chat message.
 * @param {string} roomId - Room ID
 * @param {string} id - Unique Id for each message sent.
 * @param {string} message - Chat message to be sent
 * @param {string} topic - Notification topic that user subscribed for chat 
 *                         Format: appdomain/type, ex: abcd.comcast.com/chat
 * @public
 */
IrisRtcSession.prototype.sendChatMessage = function(roomId, id, message, topic) {

    if (roomId != this.config.roomId) {
        logger.log(logger.level.ERROR, "IrisRtcSession", "sendChatMessage :: Wrong roomId, this roomId : " +
            this.config.roomId + " Received roomId : " + roomId)
        return;
    }

    if (!message || !id || (typeof id != 'string') || (typeof message != 'string')) {
        logger.log(logger.level.ERROR, "IrisRtcSession", "Message and id can't be empty : message :" +
            message + " id " + id);
        return;
    } else {
        logger.log(logger.level.INFO, "IrisRtcSession", "sendChatMessage :: message " + message);
        if (this.connection && this.connection.xmpp) {
            this.connection.xmpp.sendGroupChatMessage(this.config, id, message, topic);
        } else {
            logger.log(logger.level.ERROR, "IrisRtcSession", "sendChatMessage :: Check if Session is created ");
        }
    }
};

/**
 * This API is called to set chat state like active, composing, paused inactive, gone
 * @param {string} roomId - Room Id
 * @param {string} chatState - Chat state string - permitted values are active, composing, paused, inactive  or gone 
 * @public
 */
IrisRtcSession.prototype.sendChatState = function(roomId, chatState) {
    try {
        if (roomId != this.config.roomId) {
            logger.log(logger.level.ERROR, "IrisRtcSession", "sendChatState :: Wrong roomId, this roomId : " +
                this.config.roomId + " Received roomId : " + roomId)
            return;
        }

        var validChatStates = ['active', 'composing', 'paused', 'inactive', 'gone'];
        if (validChatStates.indexOf(chatState) == -1) {
            logger.log(logger.level.ERROR, "IrisRtcSession", "sendChatState :: Invalid chat state " + chatState + " valid chat states are ", validChatStates);
            return;
        }

        if (this.chatState == chatState) {
            logger.log(logger.level.WARNING, "IrisRtcSession", "sendChatState :: Can't send same chat state again " + chatState);
            return;
        }

        if (this.connection && this.connection.xmpp) {
            this.chatState = chatState;
            this.connection.xmpp.sendChatState(this.config, chatState);
        } else {
            logger.log(logger.level.ERROR, "IrisRtcSession", "sendChatState :: Check if Session is created ");
        }
    } catch (error) {
        logger.log(logger.level.ERROR, "IrisRtcSession", "sendChatState :: Failed to send chat state ", error);
    }
}

/**
 * This callback is called when chat state of a participant is changed
 * @param {string} roomId - Room ID
 * @param {string} participantJid - Participant Jid
 * @param {string} chatState - chat state indicator
 * @public
 */
IrisRtcSession.prototype.onChatState = function(roomId, participantJid, chatState) {
    //
}

/**
 * Entry point for ending the session
 * @private
 */
IrisRtcSession.prototype.end = function() {

    logger.log(logger.level.INFO, "IrisRtcSession", "end :: close the session");

    if (this.state != IrisRtcSession.NONE) {

        // Send events
        this.sendEvent("SDK_SessionEnded", { message: "Session is closed" });

        // Post stats to server
        if (this.sdkStats) {
            this.sdkStats.submitStats();
            this.sdkStats.events = [];
        }

        this.connection.xmpp.removeAllListeners(this.config.roomId);

        // Leave the room
        this.config.presenceType = "leave";

        // Send the presence if room is created
        this.connection.xmpp.sendPresence(this.config);

        clearInterval(this.monitorIntervalValue);

        this.onSessionEnd(this.config.roomId);

        // Set the presence state
        this.presenceState = IrisRtcSession.PRESENCE_NONE;

        // Set the pstn state
        this.pstnState = IrisRtcSession.NONE;

        this.connection.xmpp.rtcServer = null;

        // De-initialize
        if (this.config)
            this.config.traceId = null;
        this.config = null;
        this.state = IrisRtcSession.NONE;
        //this.config = null;
        this.connection = null;
        this.participants = {};
        if (this.peerconnection)
            this.peerconnection.close();
        this.peerconnection = null;
        this.stream = null;
        this.localSdp = null;
        this.localAnswer = null;
        this.jid = null;
        this.candidates = [];
        this.to = null;
        this.focusJid = null;
        this.dataChannels = [];
        this.dataChannel = null;
        this.chatState = null;

        // Add the entry
        delete this; // Does this work?
    }
};

/**
 * onAddStream callback from peerconnection
 * @private
 */
IrisRtcSession.prototype.onAddStream = function(event) {
    var self = this;

    try {
        logger.log(logger.level.INFO, "IrisRtcSession",
            " onAddStream ", event);

        var streamId = self.getStreamID(event.stream);

        if (event && event.stream && event.stream.id && event.stream.id == 'default' && self.config.useBridge) {
            logger.log(logger.level.INFO, "IrisRtcSession", "Ignore onAddStream if streamId is default");
            return;
        }

        logger.log(logger.level.INFO, "IrisRtcSession", "onAddStream : streamId : " + streamId);

        if (!streamId) {
            logger.log(logger.level.INFO, "IrisRtcSession", "No streamId is found, still sending stream");
            this.onRemoteStream(self.config.roomId, event.stream);

        } else if (streamId && streamId.indexOf('mixedmslabel') === -1) {
            logger.log(logger.level.INFO, "IrisRtcSession", " StreamId is " + streamId);
            var ssrcLines = "";
            if (RtcBrowserType.isFirefox() && self.config.useBridge) {
                var remoteDescFirefox = self.peerconnection.remoteDescription;
                remoteDescFirefox = self.interop.toPlanB(remoteDescFirefox);
                ssrcLines = self.peerconnection.remoteDescription ? SDPUtil.find_lines(remoteDescFirefox.sdp, 'a=ssrc:') : [];
            } else {
                ssrcLines = self.peerconnection.remoteDescription ? SDPUtil.find_lines(self.peerconnection.remoteDescription.sdp, 'a=ssrc:') : [];
            }

            logger.log(logger.level.VERBOSE, "IrisRtcSession", "Remote SDP " + self.peerconnection.remoteDescription.sdp);

            ssrcLines = ssrcLines.filter(function(line) {
                return ((line.indexOf('msid:' + streamId) !== -1));
            });

            logger.log(logger.level.INFO, "IrisRtcSession", "ssrcLines : " + JSON.stringify(ssrcLines));

            if (ssrcLines.length) {
                ssrc = ssrcLines[0].substring(7).split(' ')[0];
                if (self.config.useBridge) {
                    if (!self.ssrcOwners[ssrc]) {
                        logger.log(logger.level.INFO, "IrisRtcSession",
                            "No SSRC owner known for: " + ssrc);
                        return;
                    }
                    event.stream.participantJid = self.ssrcOwners[ssrc].substring(self.ssrcOwners[ssrc].indexOf('/') + 1);
                    event.stream.ssrc = ssrc;
                    logger.log(logger.level.VERBOSE, "IrisRtcSession",
                        'participantJid', self.ssrcOwners[ssrc].substring(self.ssrcOwners[ssrc].indexOf('/') + 1));
                } else {
                    logger.log(logger.level.VERBOSE, "IrisRtcSession",
                        "Remote stream is assigned with default participant Id : " + self.jid);

                    event.stream.participantJid = self.jid;
                }
            } else {
                logger.log(logger.level.INFO, "IrisRtcSession",
                    "No SSRC lines found for streamId : " + streamId);

                logger.log(logger.level.WARNING, "IrisRtcSession",
                    "Remote stream is assigned with default participant Id : " + self.jid);

                event.stream.participantJid = self.jid;
            }
            if ((event.stream.id !== 'mixedmslabel') && (event.stream.label !== 'mixedmslabel')) {
                try {
                    logger.log(logger.level.INFO, "IrisRtcSession",
                        " Received stream :: ", event.stream);

                    logger.log(logger.level.INFO, "IrisRtcSession", " Sending stream to client ", event.stream);
                    this.onRemoteStream(self.config.roomId, event.stream);

                    //Save stream to participant lists
                    self.participants[event.stream.participantJid].stream = event.stream;

                } catch (err) {
                    logger.log(logger.level.ERROR, "IrisRtcSession", " onAddStream ", err);
                }
            }
        } else {
            logger.log(logger.level.INFO, "IrisRtcSession", " Stream is mixedmslabel : streamId " + streamId);
        }
    } catch (error) {
        logger.log(logger.level.ERROR, "IrisRtcSession", " onAddStream ", error);
    }
};

/**
 * onIceCandidate callback from peerconnection
 * @private
 */
IrisRtcSession.prototype.sendCandidates = function() {
    logger.log(logger.level.VERBOSE, "IrisRtcSession", "sendCandidates");
    var self = this;
    // Check the current state whether the remote participant has joined the room
    if ((Object.keys(this.participants).length != 0) && (self.config.useBridge || this.localSdp || this.localAnswer)) {
        this.candidates.forEach(function(candidate) {
            var type;
            if (self.focusJid) {
                type = "responder";
            } else {
                type = "initiator";
            }
            var singleCandidateArray = [];
            singleCandidateArray.push(candidate);

            // Send the transport-info now;
            var data = {
                "candidates": singleCandidateArray,
                "type": type,
                "to": self.to,
                "sdp": self.localSdp,
                "traceId": self.config.traceId,
            };

            // Send the transport-info
            self.connection.xmpp.sendTransportInfo(data);

            self.sendEvent("SDK_XMPPJingleTransportInfoSent", candidate);
        });
        // Clear the candidates
        this.candidates = [];
    } else {
        logger.log(logger.level.VERBOSE, "IrisRtcSession", "sendCandidates " +
            " Participants not joined yet " + this.participants + " localSDP " + this.localSdp);
    }
};

/**
 * onIceCandidate callback from peerconnection
 * @param {object} event  
 * @private
 */
IrisRtcSession.prototype.onIceCandidate = function(event) {
    logger.log(logger.level.INFO, "IrisRtcSession",
        " onIceCandidate ", event.candidate);

    var self = this;
    // Check if the event is nil
    if (event && event.candidate) {
        logger.log(logger.level.INFO, "IrisRtcSession", "Candidate : " + JSON.stringify(event.candidate.candidate));
        if (self.config.useRelay && event.candidate.candidate.indexOf('relay') == -1) {
            logger.log(logger.level.INFO, "IrisRtcSession", "Ignoring Non-relay candidates");
            return;
        }
        // Buffer the candidates first 
        this.candidates.push(event.candidate);

        // send the candidates
        this.sendCandidates();
    }
};

/**
 * onIceConnectionStateChange callback from peerconnection
 * @param {object} event 
 * @private 
 */
IrisRtcSession.prototype.onIceConnectionStateChange = function(event) {
    if (this.peerconnection) {
        this.updateAddSourcesQueue();
        var iceState = ""
        if (this.peerconnection.iceConnectionState) {
            logger.log(logger.level.INFO, "IrisRtcSession",
                " onIceConnectionStateChange " + this.peerconnection.iceConnectionState);

            iceState = this.peerconnection.iceConnectionState ? this.peerconnection.iceConnectionState.toString() : "NA";

            if (this.peerconnection.iceConnectionState.toString() == "connected") {

                this.state = IrisRtcSession.CONNECTED;

                if (this.config.type == "pstn")
                    this.pstnState = IrisRtcSession.CONNECTED;

                this.onSessionConnected(this.config.roomId);
            }
        } else if (this.peerconnection.iceState) {
            logger.log(logger.level.INFO, "IrisRtcSession",
                " onIceConnectionStateChange " + this.peerconnection.iceState);

            iceState = this.peerconnection.iceState ? this.peerconnection.iceState.toString() : "NA";

            if (this.peerconnection.iceState.toString() == "connected") {
                this.state = IrisRtcSession.CONNECTED;
                this.onSessionConnected(this.config.roomId);
            }
        } else {
            logger.log(logger.level.ERROR, "IrisRtcSession",
                " onIceConnectionStateChange :: Error in finding iceConnectionState");
        }

        switch (iceState) {
            case "new":
                this.sendEvent("SDK_ICEConnectionNew", { message: iceState });
                break;
            case "checking":
                this.sendEvent("SDK_ICEConnectionChecking", { message: iceState });
                break;
            case "connected":
                this.sendEvent("SDK_ICEConnectionConnected", { message: iceState });
                break;
            case "completed":
                this.sendEvent("SDK_ICEConnectionCompleted", { message: iceState });
                break;
            case "failed":
                this.sendEvent("SDK_ICEConnectionFailed", { message: iceState });
                break;
            case "disconnected":
                this.sendEvent("SDK_ICEConnectionDisconnected", { message: iceState });
                break;
            case "closed":
                this.sendEvent("SDK_ICEConnectionClosed", { message: iceState });
                break;
            default:
                this.sendEvent("SDK_ICEConnectionState", { message: iceState });
        }
    }
};

/**
 * onSignalingStateChange callback from peerconnection
 * @param
 * @private
 */
IrisRtcSession.prototype.onSignalingStateChange = function(event) {
    if (this.peerconnection) {
        this.updateAddSourcesQueue();
        logger.log(logger.level.INFO, "IrisRtcSession",
            " onSignalingStateChange " + this.peerconnection.signalingState);

        var signalState = this.peerconnection.signalingState ? this.peerconnection.signalingState.toString() : "NA";

        switch (signalState) {
            case "stable":
                this.sendEvent("SDK_SignalingStateStable", { message: signalState });
                break;
            case "have-local-offer":
                this.sendEvent("SDK_SignalingStateHaveLocalOffer", { message: signalState });
                break;
            case "have-remote-offer":
                this.sendEvent("SDK_SignalingStateHaveRemoteOffer", { message: signalState });
                break;
            case "have-local-pranswer":
                this.sendEvent("SDK_SignalingStateHaveLocalPranswer", { message: signalState });
                break;
            case "have-remote-pranswer":
                this.sendEvent("SDK_SignalingStateHaveRemotePranswer", { message: signalState });
                break;
            case "closed":
                this.sendEvent("SDK_SignalingStateClosed", { message: signalState });
                break;
            default:
                this.sendEvent("SDK_SignalingState", { message: signalState });

        }
    }
};

/**
 * onIceGatheringStateChange callback from peerconnection
 * @param 
 * @private
 */
IrisRtcSession.prototype.onIceGatheringStateChange = function() {
    if (this.peerconnection) {

        logger.log(logger.level.INFO, "IrisRtcSession",
            " onIceGatheringStateChange " + this.peerconnection.iceGatheringState);

        var gatheringState = this.peerconnection.iceGatheringState ? this.peerconnection.iceGatheringState.toString() : "NA";

        switch (gatheringState) {
            case "new":
                this.sendEvent("SDK_ICEGatheringNew", { message: gatheringState });
                break;
            case "gathering":
                this.sendEvent("SDK_ICEGathering", { message: gatheringState });
                break;
            case "complete":
                this.sendEvent("SDK_ICEGatheringCompleted", { message: gatheringState });
                break;
            default:
                this.sendEvent("SDK_ICEGathering", { message: gatheringState });
        }
    }
}

/**
 * onDataChannel callback from peerconnection
 * @param {event} 
 * @private
 */
IrisRtcSession.prototype.onDataChannel = function(event) {
    logger.log(logger.level.INFO, "IrisRtcSession", " onDataChannel ", event);
    var self = this;
    try {
        if (!event || !event.channel) {
            return;
        }

        // Assign the event's data channel to Iris data channel
        self.dataChannel = event.channel;
        var dataChannel = event.channel;
        if (!dataChannel) {
            logger.log(logger.level.ERROR, "IrisRtcSession", "Data Channel error ", dataChannel);
            return;
        }

        dataChannel.onopen = function() {
            logger.log(logger.level.VERBOSE, "IrisRtcSession", "Data Channel is opened ", dataChannel);

            self.sendEvent("SDK_DataChannelOpened", { message: "Datachannel is opened with brdige" });

        };

        dataChannel.onmessage = function(event) {
            logger.log(logger.level.VERBOSE, "IrisRtcSession", "Data Channel onmessage ", event);

            var data = event.data;
            // JSON
            var obj;
            //var msgData = data;

            try {
                obj = JSON.parse(data);
            } catch (e) {
                logger.log(logger.level.ERROR, "IrisRtcSession",
                    "Failed to parse data channel message as JSON: ", data);
            }

            if (('undefined' !== typeof(obj)) && (null !== obj)) {
                var colibriClass = obj.colibriClass;

                if ("DominantSpeakerEndpointChangeEvent" === colibriClass) {
                    // Endpoint ID from the Videobridge.
                    var dominantSpeakerEndpoint = obj.dominantSpeakerEndpoint;

                    logger.log(logger.level.INFO, "IrisRtcSession",
                        "New dominant speaker event: ", dominantSpeakerEndpoint);
                    self.onDominantSpeakerChanged(self.config.roomId, dominantSpeakerEndpoint);
                } else if ("InLastNChangeEvent" === colibriClass) {
                    var oldValue = obj.oldValue;
                    var newValue = obj.newValue;

                    logger.log(logger.level.INFO, "IrisRtcSession", "InLastNChangeEvent: ", obj);

                    // Make sure that oldValue and newValue are of type boolean.
                    var type;

                    if ((type = typeof oldValue) !== 'boolean') {
                        if (type === 'string') {
                            oldValue = (oldValue == "true");
                        } else {
                            oldValue = new Boolean(oldValue).valueOf();
                        }
                    }
                    if ((type = typeof newValue) !== 'boolean') {
                        if (type === 'string') {
                            newValue = (newValue == "true");
                        } else {
                            newValue = new Boolean(newValue).valueOf();
                        }
                    }
                    self.lastNChanged(oldValue, newValue);
                } else if ("LastNEndpointsChangeEvent" === colibriClass) {
                    // The new/latest list of last-n endpoint IDs.
                    var lastNEndpoints = obj.lastNEndpoints;
                    // The list of endpoint IDs which are entering the list of
                    // last-n at this time i.e. were not in the old list of last-n
                    // endpoint IDs.
                    var endpointsEnteringLastN = obj.endpointsEnteringLastN;

                    logger.log(logger.level.INFO, "IrisRtcSession",
                        "New last-n event: lastNEndpoints" +
                        JSON.stringify(lastNEndpoints) + " endpointsEnteringLastN :" + JSON.stringify(endpointsEnteringLastN));

                    self.lastNEndPointChanged(lastNEndpoints, endpointsEnteringLastN, obj);
                } else if ("EndpointConnectivityStatusChangeEvent" == colibriClass) {
                    var endpoint = obj.endpoint;
                    var isActive = obj.active === 'true';
                    logger.log(logger.level.INFO, "IrisRtcSession", "EndpointConnectivityStatusChangeEvent endpoint : " + endpoint + " isActive" + isActive);
                } else if ("EndpointMessage" == colibriClass) {
                    var from = obj.from;
                    var msg = obj.msgPayload;
                    logger.log(logger.level.INFO, "IrisRtcSession", "EndpointMessage from :" + from + " msg", msg);

                } else {
                    logger.log(logger.level.INFO, "IrisRtcSession", "Data channel JSON-formatted message: ", obj);
                    // The received message appears to be appropriately formatted
                    // (i.e. is a JSON object which assigns a value to the mandatory
                    // property colibriClass) so don't just swallow it, expose it to
                    // public consumption.
                    self.onDataChannelMessage(colibriClass, obj);
                }
            }
        };

        dataChannel.onerror = function(error) {
            logger.log(logger.level.ERROR, "IrisRtcSession", "Data Channel Error :: ", error);
        };

        dataChannel.onclose = function() {
            logger.log(logger.level.VERBOSE, "IrisRtcSession",
                "Data Channel is closed", dataChannel);
            var idx = self.dataChannels.indexOf(dataChannel);
            if (idx > -1)
                self.dataChannels = self.dataChannels.splice(idx, 1);
        };

        this.dataChannels.push(dataChannel);

    } catch (error) {
        logger.log(logger.level.ERROR, "IrisRtcSession", "onDataChannel error ", error);
    }
};


/**
 * Elects the participant with the given id to be the selected participant in
 * order to receive higher video quality.
 * @param {string} roomId - Room ID
 * @param {string} participantId the identifier of the participant
 * @public
 */
IrisRtcSession.prototype.selectParticipant = function(roomId, participantId) {
    try {
        if (roomId != this.config.roomId)
            return;

        if (this.dataChannel && participantId) {

            var jsonObject = {
                colibriClass: 'SelectedEndpointChangedEvent',
                selectedEndpoint: participantId || null
            };
            logger.log(logger.level.INFO, "IrisRtcSession", "selectParticipant :: Sending SelectedEndpointChangedEvent : " + JSON.stringify(jsonObject));
            this.sendEvent("SDK_SelectParticipant", jsonObject);
            this.dataChannel.send(JSON.stringify(jsonObject));
        }

    } catch (error) {
        logger.log(logger.level.ERROR, "IrisRtcSession", "selectParticipant :: Failed to select participant ", error);
    }
};

/**
 * Elects the participant with the given id to be the pinned participant in
 * order to always receive video for this participant (even when last n is
 * enabled).
 * @param {string} roomId
 * @param {string} participantId - Jid of the participant
 * @public
 */
IrisRtcSession.prototype.pinParticipant = function(roomId, participantId) {

    try {
        if (roomId != this.config.roomId)
            return;

        if (this.dataChannel && participantId) {

            var jsonObject = {
                colibriClass: 'PinnedEndpointChangedEvent',
                pinnedEndpoint: participantId || null
            };

            logger.log(logger.level.INFO, "IrisRtcSession", "pinParticipant :: Sending PinnedEndpointChangedEvent : " + JSON.stringify(jsonObject));
            this.sendEvent("SDK_PinParticipant", jsonObject);
            this.dataChannel.send(JSON.stringify(jsonObject));

        } else {
            logger.log(logger.level.ERROR, "IrisRtcSession", "pinParticipant ::Data channel or participantJid is null. Jid: " + participantId + "  datachannel: ", this.dataChannel);
        }
    } catch (error) {
        logger.log(logger.level.ERROR, "IrisRtcSession", "pinParticipant :: Failed to pin participant ", error);
    }
};

/**
 * Selects a new value for "lastN". The requested amount of videos are going
 * to be delivered after the value is in effect. Set to -1 for unlimited or
 * all available videos.
 * @param {string} roomId - Room ID
 * @param lastN the new number of videos the user would like to receive.
 * @public
 */
IrisRtcSession.prototype.setLastN = function(roomId, value) {
    try {

        if (roomId != this.config.roomId)
            return;

        if (!this.dataChannel) {
            logger.log(logger.level.ERROR, "IrisRtcSession", "Data Channel is null");
            return;
        }
        if (!Number.isInteger(value) && !Number.parseInt(value, 10)) {
            logger.log(logger.level.ERROR, "IrisRtcSession", "lastN value is invalid");
            return;
        }
        const n = Number(value);

        if (n < -1) {
            logger.log(logger.level.ERROR, "IrisRtcSession", "lastN value cannot be smaller than -1");
            return;
        }
        var jsonObject = {
            colibriClass: 'LastNChangedEvent',
            lastN: n
        };
        logger.log(logger.level.INFO, "IrisRtcSession", "Sending LastNChangedEvent : " + JSON.stringify(jsonObject));

        this.sendEvent("SDK_SetLastN", jsonObject);

        this.dataChannel.send(JSON.stringify(jsonObject));

    } catch (error) {
        logger.log(logger.level.ERROR, "IrisRtcSession", "Failed to set lastN", error);

    }
};

/**
 * Sends a message through data channel
 * @param {string} roomId - Room ID
 * @param {string} to - Participant jid
 * @param {string} msg - Message to be sent
 * @private
 */
IrisRtcSession.prototype.sendChannelMessage = function(roomId, participantJid, msg) {
    try {
        if (this.dataChannel && participantJid && msg) {
            var jsonObject = {
                colibriClass: 'EndpointMessage',
                msgPayload: msg,
                to: participantJid
            };
            logger.log(logger.level.INFO, "IrisRtcSession", "sendChannelMessage : " + JSON.stringify(jsonObject));

            this.dataChannel.send(JSON.stringify(jsonObject));
        }
    } catch (error) {
        logger.log(logger.level.ERROR, "IrisRtcSession", "Failed to sendChannelMessage", error);
    }
};

/**
 * onRemoveStream callback from peerconnection 
 * @param {object} event - on remove stream event
 * @private
 */
IrisRtcSession.prototype.onRemoveStream = function(event) {
    logger.log(logger.level.INFO, "IrisRtcSession",
        " onRemoveStream ", event);
};


/**
 * Initialize webrtc stack
 * @param {object} response
 * @param {string} type
 * @private
 */
IrisRtcSession.prototype.initWebRTC = function(response, type) {

    logger.log(logger.level.INFO, "IrisRtcSession",
        " Initialize webrtc stack with iceServers " + response +
        " peerconnection ", this.peerconnection);

    // Initialize only if peerconnection is not created
    if (this.peerconnection == null) {
        var iceUrls = [];

        // Check if the response has iceservers
        var json = JSON.parse(response);
        if (json && json.ice_servers) {
            var urlArray = json.ice_servers;
            logger.log(logger.level.VERBOSE, "IrisRtcSession",
                " Received ice urls ", urlArray);
            for (var i = 0; i < urlArray.length; i++) {

                // Check if the element itself is an array or not
                if (urlArray[i].urls instanceof Array) {
                    for (var j = 0; j < urlArray[i].urls.length; j++) {

                        if (this.config.useBridge && (urlArray[i].urls[j].indexOf('turn:') != -1 || urlArray[i].urls[j].indexOf('turns:') != -1))
                            continue;

                        if (urlArray[i].username && urlArray[i].credential) {
                            iceUrls.push({
                                'urls': [urlArray[i].urls[j]],
                                'username': urlArray[i].username,
                                'credential': urlArray[i].credential
                            });
                        } else {
                            iceUrls.push({
                                'urls': [urlArray[i].urls[j]],
                            });
                        }
                    }
                }
                // Add element to the array
                else {

                    if (this.config.useBridge && (urlArray[i].urls.indexOf('turn:') != -1 || urlArray[i].urls.indexOf('turns:') != -1))
                        continue;

                    if (urlArray[i].urls.username && urlArray[i].urls.credential) {
                        iceUrls.push({
                            'urls': [urlArray[i].urls],
                            'username': urlArray[i].urls.username,
                            'credential': urlArray[i].urls.credential
                        });
                    } else {
                        iceUrls.push({
                            'urls': [urlArray[i].urls],
                        });
                    }
                }
            }
        }

        // For testing as xmpp ones arent working
        iceUrls.push({ urls: ["stun:stun.l.google.com:19302"] });

        // Urls populated, add to main element
        var iceServers = { 'iceServers': iceUrls };

        logger.log(logger.level.INFO, "IrisRtcSession",
            " Createpeerconnection " + typeof WebRTC.RTCPeerConnection);
        try {

            var constraints;
            if (type == "video") {
                var receiveVideo = true;
                var receiveAudio = true;

                if (this.config.stream && this.config.stream === 'sendonly') {
                    receiveVideo = false;
                    receiveAudio = false;
                }
                constraints = {
                    "optional": [{ "DtlsSrtpKeyAgreement": true }],
                    "mandatory": {
                        OfferToReceiveAudio: receiveVideo,
                        OfferToReceiveVideo: receiveAudio,
                    }
                };

            } else {

                constraints = {
                    "optional": [
                        { "DtlsSrtpKeyAgreement": true }
                    ]
                };
            }

            if (this.config.useIPv6) {
                constraints.optional.push({ googIPv6: true });
            }

            this.pcConstraints = constraints;

            logger.log(logger.level.INFO, "IrisRtcSession",
                " Createpeerconnection with iceServers " + JSON.stringify(iceServers) +
                " constraints " + JSON.stringify(constraints));

            this.peerconnection = new WebRTC.RTCPeerConnection(iceServers, constraints);

            // set the callbacks
            this.peerconnection.onicecandidate = this.onIceCandidate.bind(this);
            this.peerconnection.oniceconnectionstatechange = this.onIceConnectionStateChange.bind(this);
            this.peerconnection.onsignalingstatechange = this.onSignalingStateChange.bind(this);
            this.peerconnection.ondatachannel = this.onDataChannel.bind(this);
            this.peerconnection.onremovestream = this.onRemoveStream.bind(this);
            this.peerconnection.onicechange = this.onIceConnectionStateChange.bind(this);
            this.peerconnection.onaddstream = this.onAddStream.bind(this);

            // this.peerconnection.ontrack = this.onAddTrack.bind(this);
        } catch (e) {
            logger.log(logger.level.INFO, "IrisRtcSession",
                " Createpeerconnection error " + JSON.stringify(e));
            this.onError(this.config.roomId, e);
        }

    }
};

/**
 * Set offer
 * @param {object} desc
 * @param {string} participant id
 * @private
 */
IrisRtcSession.prototype.setOffer = function(desc, from) {

    // Assign self
    var self = this;
    // Set constraints
    //var constraints = {};

    if (self.config.type == "video" || self.config.type == "audio") {
        var modSDP = desc.sdp;

        // modSDP = modSDP.replace("a=sendrecv\r\n", "a=recvonly\r\n");
        // modSDP = modSDP.replace("a=sendrecv\r\n", "a=recvonly\r\n");

        desc.sdp = modSDP;

        logger.log(logger.level.VERBOSE, "IrisRtcSession",
            " Modified Offer \n" + desc.sdp);
    }

    if ((self.config.type == "video" || self.config.type == "audio") && self.config.useBridge == true) {
        // Remove codecs not supported
        if (self.config.videoCodec && self.config.videoCodec.toLowerCase() == "h264") {
            //desc.sdp = removeCodec(desc.sdp, "VP8");
            //desc.sdp = removeCodec(desc.sdp, "VP9");
            desc.sdp = preferH264(desc.sdp);
        }

        // Preferring audio codecs
        if (self.config.audioCodec && self.config.audioCodec.toLowerCase() == "isac") {
            desc.sdp = preferISAC(desc.sdp);
        }
        //opus/48000/2
        if (self.config.audioCodec && self.config.audioCodec.toLowerCase() == "opus") {
            desc.sdp = preferOpus(desc.sdp);
        }

        logger.log(logger.level.INFO, "IrisRtcSession",
            "Modified offer \n" + desc.sdp);
    }

    if (RtcBrowserType.isFirefox() && self.config.useBridge) {
        desc = self.interop.toUnifiedPlan(desc);
        logger.log(logger.level.INFO, "IrisRtcSession",
            " Answer created Firefox specific :: toUnifiedPlan ::" + desc.sdp);
    }
    // Call the peerconnection setRemoteDescription
    this.peerconnection.setRemoteDescription(desc,
        function() {
            logger.log(logger.level.INFO, "IrisRtcSession",
                " setOffer Success ");

            // Create Answer now
            self.peerconnection.createAnswer(function(answerDesc) {
                    logger.log(logger.level.INFO, "IrisRtcSession",
                        " Answer created " + answerDesc.sdp);
                    if (RtcBrowserType.isFirefox() && self.config.useBridge) {
                        var answer = self.interop.toPlanB(answerDesc);
                        answerDesc = self.interop.toUnifiedPlan(answer);
                    } else {
                        var answer = answerDesc;
                    }
                    // Send the answer
                    var data = {
                        "sdp": answer.sdp,
                        "to": self.to,
                        "traceId": self.config.traceId,
                    };

                    self.localSdp = answer.sdp;

                    // Send session-accept
                    self.connection.xmpp.sendSessionAccept(data);

                    self.sendEvent("SDK_XMPPJingleSessionAcceptSent", { message: "Session-accept is sent" });

                    //If it is p2p call send candidates after offer is set 
                    //and answer is sent 
                    if (!self.config.useBridge) {
                        self.localAnswer = answer;
                        self.sendCandidates();
                    }

                    // Call set local description
                    self.peerconnection.setLocalDescription(answerDesc, function() {
                        logger.log(logger.level.INFO, "IrisRtcSession",
                            " setLocalDescription Success ");
                    }, function(error) {
                        logger.log(logger.level.ERROR, "IrisRtcSession",
                            " setLocalDescription Error " + error);
                    });
                },
                function(err) {
                    logger.log(logger.level.ERROR, "IrisRtcSession",
                        " createAnswer Failure with error " + err);
                },
                self.pcConstraints
            );
        },
        function(err) {
            logger.log(logger.level.ERROR, "IrisRtcSession",
                " setRemoteDescription Failure with error " + err);
        });
};

/**
 * Set re offer
 * @param {object} desc
 * @param {string} participant id
 * @private
 */
IrisRtcSession.prototype.setReOffer = function(data) {

    // Assign self
    var self = this;
    // Set constraints
    //var constraints = {};

    //    if (self.config.type == "video") {
    //        var modSDP = desc.sdp;
    //        //nija
    //        // modSDP = modSDP.replace("a=sendrecv\r\n", "a=recvonly\r\n");
    //        // modSDP = modSDP.replace("a=sendrecv\r\n", "a=recvonly\r\n");
    //
    //        desc.sdp = modSDP;
    //
    //        logger.log(logger.level.INFO, "IrisRtcSession",
    //            " Updated Offer Recv" + desc.sdp);
    //    }
    //
    //    if (rtcConfig.json.useBridge == true) {
    //        // Remove codecs not supported
    //        if (self.config.codec == "h264") {
    //            //desc.sdp = removeCodec(desc.sdp, "VP8");
    //            //desc.sdp = removeCodec(desc.sdp, "VP9");
    //            desc.sdp = preferH264(desc.sdp);
    //        }
    //
    //
    //        logger.log(logger.level.INFO, "IrisRtcSession",
    //            " Answer after updating codecs " + desc.sdp);
    //    }

    if (RtcBrowserType.isFirefox() && self.config.useBridge) {
        this.addSourceFF(data);
        return;
    }
    var old_sdp = new SDP(this.peerconnection.localDescription.sdp);
    var sdp = new SDP(this.peerconnection.remoteDescription.sdp);

    sdp.addSources(data.jingle);
    var desc = new RTCSessionDescription({ type: 'offer', sdp: sdp.raw });

    // Call the peerconnection setRemoteDescription
    this.peerconnection.setRemoteDescription(desc,
        function() {
            logger.log(logger.level.INFO, "IrisRtcSession",
                " setReOffer Success ");

            // Create Answer now
            self.peerconnection.createAnswer(function(answerDesc) {
                    logger.log(logger.level.INFO, "IrisRtcSession",
                        " Answer created " + answerDesc.sdp);
                    // Send the answer


                    // Call set local description
                    self.peerconnection.setLocalDescription(answerDesc, function() {
                        logger.log(logger.level.INFO, "IrisRtcSession",
                            " setLocalDescription Success ");

                        var new_sdp = new SDP(self.peerconnection.localDescription.sdp);
                        var sdpDiffer = new SDPDiffer(old_sdp, new_sdp);

                        var dataAdd = {
                            "to": self.to,
                            "traceId": self.config.traceId,
                        };

                        self.connection.xmpp.sendSourceAdd(sdpDiffer, dataAdd);

                    }, function(error) {
                        logger.log(logger.level.ERROR, "IrisRtcSession",
                            " setLocalDescription Error " + error);
                    });


                },
                function(err) {
                    logger.log(logger.level.ERROR, "IrisRtcSession",
                        " createAnswer Failure with error " + err);
                }, self.pcConstraints
            );
        },
        function(err) {
            logger.log(logger.level.ERROR, "IrisRtcSession",
                " setRemoteDescription Failure with error " + err);
        });
};


/**
 * @private
 */
IrisRtcSession.prototype.addSourceFF = function(data, successCallback, queueCallback) {
    var self = this;

    // data = self.dataNew;

    if (!(this.peerconnection.signalingState == 'stable' &&
            this.peerconnection.iceConnectionState == 'connected')) {
        logger.log(logger.level.VERBOSE, "IrisRtcSession", "Too early to send updates");
        return;
    }

    logger.log(logger.level.VERBOSE, "IrisRtcSession", "addSourceFF");

    var localsdp_new = this.interop.toPlanB(this.peerconnection.localDescription);
    var old_sdp = new SDP(localsdp_new.sdp);
    var sdpnew = this.interop.toPlanB(this.peerconnection.remoteDescription);
    var sdp = new SDP(sdpnew.sdp);

    sdp.addSources(data.jingle);
    var desc = new RTCSessionDescription({ type: 'offer', sdp: sdp.raw });
    desc = self.interop.toUnifiedPlan(desc);

    // Call the peerconnection setRemoteDescription
    this.peerconnection.setRemoteDescription(desc,
        function() {
            logger.log(logger.level.INFO, "IrisRtcSession",
                " setReOffer Success ");

            // Create Answer now
            self.peerconnection.createAnswer(function(answerDesc) {
                    logger.log(logger.level.INFO, "IrisRtcSession",
                        " Answer created " + answerDesc.sdp);
                    self.localSdp = answerDesc.sdp;

                    answerDesc = self.interop.toPlanB(answerDesc);

                    answerDesc = self.interop.toUnifiedPlan(answerDesc);

                    // Call set local description
                    self.peerconnection.setLocalDescription(answerDesc, function() {
                        logger.log(logger.level.INFO, "IrisRtcSession",
                            " setLocalDescription Success ");

                        if (successCallback) {
                            successCallback(old_sdp);
                        }

                        // var localsdp_new = self.interop.toPlanB(self.peerconnection.localDescription);
                        // var new_sdp = new SDP(localsdp_new.sdp);
                        // var sdpDiffer = new SDPDiffer(old_sdp, new_sdp);

                        // var dataAdd = {
                        //     "to": self.to,
                        //     "rootNodeId": self.config.rootNodeId,
                        //     "childNodeId": self.config.childNodeId,
                        //     "traceId": self.config.traceId,
                        //     "eventType": self.config.eventType
                        // };
                        // self.connection.xmpp.sendSourceAdd(sdpDiffer, dataAdd);

                    }, function(error) {
                        logger.log(logger.level.ERROR, "IrisRtcSession",
                            " setLocalDescription Error " + error);
                        queueCallback();
                    });
                },
                function(err) {
                    logger.log(logger.level.ERROR, "IrisRtcSession",
                        " createAnswer Failure with error " + err);
                    queueCallback();
                }, self.pcConstraints
            );
        },
        function(err) {
            logger.log(logger.level.ERROR, "IrisRtcSession",
                " setRemoteDescription Failure with error " + err);
            queueCallback();
        });
};

/**
 * @private
 */
IrisRtcSession.prototype.setReOfferForSourceRemove = function(desc) {
    var self = this;
    try {

        if (!desc.raw) {
            return;
        }

        var remoteDesc = new RTCSessionDescription({ "sdp": desc.raw, "type": "offer" });

        self.peerconnection.setRemoteDescription(remoteDesc, function() {
            logger.log(logger.level.INFO, "IrisRtcSession", "setRemoteDescription success");

            self.peerconnection.createAnswer(function(answer) {
                logger.log(logger.level.INFO, "IrisRtcSession", "createAnswer success");

                self.peerconnection.setLocalDescription(answer, function() {
                    logger.log(logger.level.INFO, "IrisRtcSession", "setLocalDescription success");

                    // DONE

                }, function(error) {
                    logger.log(logger.level.ERROR, "IrisRtcSession", "Failed to setLocalDescription ", error);
                });
            }, function(error) {
                logger.log(logger.level.ERROR, "IrisRtcSession", "Failed to createAnswer ", error);
            }, self.pcConstraints);
        }, function(error) {
            logger.log(logger.level.ERROR, "IrisRtcSession", "Failed to setRemoteDescription ", error);

        });
    } catch (error) {
        logger.log(logger.level.ERROR, "IrisRtcSession",
            " Failed to send source add " + error);
    }
};

/**
 * Set answer
 * @private
 */
IrisRtcSession.prototype.setAnswer = function(desc, from) {

    // Assign self
    //var self = this;
    // Set constraints
    //var constraints = {};

    // Call the peerconnection setRemoteDescription
    this.peerconnection.setRemoteDescription(desc,
        function() {
            logger.log(logger.level.INFO, "IrisRtcSession",
                " setRemoteDescription Success ");
        },
        function(err) {
            logger.log(logger.level.ERROR, "IrisRtcSession",
                " setRemoteDescription Failure with error " + err);
        });
};

/**
 * Create offer
 * @private
 */
IrisRtcSession.prototype.createOffer = function(type) {
    logger.log(logger.level.INFO, "IrisRtcSession",
        " createOffer " + type);

    var self = this;
    // Error checking
    if ((type == "audio" || type == "video") && this.peerconnection) {
        // Check peerconnection
        var constraints = {
            "optional": [
                { "DtlsSrtpKeyAgreement": true }
            ]
        };

        // call create offer
        this.peerconnection.createOffer(function(desc) {
            logger.log(logger.level.INFO, "IrisRtcSession",
                " Offer created " + desc.sdp);

            if (type == "video") {
                var modSDP = desc.sdp;

                desc.sdp = modSDP;

                // Camera supports only H264 so removing other codecs
                if (self.config.videoCodec == "h264" || self.config.videoCodec == "H264") {
                    desc.sdp = removeCodec(desc.sdp, "VP8");
                    desc.sdp = removeCodec(desc.sdp, "VP9");
                } else if (self.config.videoCodec == "vp8" || self.config.videoCodec == "VP8") {
                    desc.sdp = removeCodec(desc.sdp, "H264");
                    desc.sdp = removeCodec(desc.sdp, "VP9");
                } else if (self.config.videoCodec == "vp9" || self.config.videoCodec == "VP9") {
                    desc.sdp = removeCodec(desc.sdp, "H264");
                    desc.sdp = removeCodec(desc.sdp, "VP8");
                }
                if (self.config.audioCodec && self.config.audioCodec == "isac") {
                    var serializer = new SDPMangler(desc.sdp);
                    // 111 103 104 9 0 8 106 105 13 110 112 113 126
                    serializer.audio.payload(111).remove();
                    desc.sdp = serializer.deserialize();
                }

                if (self.config.audioCodec && self.config.audioCodec == "opus") {
                    var serializer = new SDPMangler(desc.sdp);
                    // 111 103 104 9 0 8 106 105 13 110 112 113 126
                    serializer.audio.payload(103).remove();
                    serializer.audio.payload(104).remove();

                    desc.sdp = serializer.deserialize();
                }

                //TBD - Preferring audio codec for p2p call

                logger.log(logger.level.INFO, "IrisRtcSession",
                    " Updated Offer" + desc.sdp);
            }

            // Call set local description
            self.peerconnection.setLocalDescription(desc, function() {
                logger.log(logger.level.INFO, "IrisRtcSession",
                    " setLocalDescription Success ");
            }, function(error) {
                logger.log(logger.level.ERROR, "IrisRtcSession",
                    " setLocalDescription Error " + error);
            }, constraints);

            // Save the sdp for later
            //self.localSdp = preferH264ForCamera(desc.sdp);
            self.localSdp = desc.sdp;

            // if participant has already joined
        }, function(error) {
            logger.log(logger.level.ERROR, "IrisRtcSession",
                " createOffer Error " + error);
        }, self.pcConstraints);
    } else {
        logger.log(logger.level.ERROR, "IrisRtcSession",
            " Peerconnection is null !! or incorrect type " + type);
    }
};

/**
 * Send source add when stream is add
 * @private
 */
IrisRtcSession.prototype.sendSourceAdd = function() {
    var self = this;
    try {
        if (!self.peerconnection.localDescription.sdp || !self.peerconnection.remoteDescription.sdp) {
            return;
        }

        var mySdp = new SDP(self.peerconnection.localDescription.sdp);
        var remoteSDP = self.peerconnection.remoteDescription.sdp;

        var remoteDesc = new RTCSessionDescription({ "sdp": remoteSDP, "type": "offer" });

        self.peerconnection.setRemoteDescription(remoteDesc, function() {
            logger.log(logger.level.INFO, "IrisRtcSession", "setRemoteDescription success");

            self.peerconnection.createAnswer(function(answer) {
                logger.log(logger.level.INFO, "IrisRtcSession", "createAnswer success");

                self.peerconnection.setLocalDescription(answer, function() {
                    logger.log(logger.level.INFO, "IrisRtcSession", "setLocalDescription success");

                    var newSdp = new SDP(self.peerconnection.localDescription.sdp);

                    // Check old and new local sdp difference to send source add
                    // self.notifyMySSRCUpdate(mySdp, newSdp);

                    if (!(self.peerconnection.signalingState == 'stable' &&
                            self.peerconnection.iceConnectionState == 'connected')) {
                        logger.log(logger.level.INFO, "Too early to send updates");
                        return;
                    }

                    var sdpDiffer = new SDPDiffer(mySdp, newSdp);

                    var data = {
                        "sdp": sdpDiffer,
                        "to": self.to,
                        "traceId": self.config.traceId,
                    };

                    self.connection.xmpp.sendSourceAdd(sdpDiffer, data);
                    self.sendEvent("SDK_SendSourceAdd", data);

                }, function(error) {
                    logger.log(logger.level.ERROR, "IrisRtcSession", "Failed to setLocalDescription ", error);
                });
            }, function(error) {
                logger.log(logger.level.ERROR, "IrisRtcSession", "Failed to createAnswer ", error);
            }, self.pcConstraints);
        }, function(error) {
            logger.log(logger.level.ERROR, "IrisRtcSession", "Failed to setRemoteDescription ", error);

        });
    } catch (error) {
        logger.log(logger.level.ERROR, "IrisRtcSession",
            " Failed to send source add " + error);
    }
};

/**
 * Send source add when stream is add
 * @private
 */
IrisRtcSession.prototype.sendSourceRemove = function() {
    var self = this;
    try {
        if (!self.peerconnection.localDescription.sdp || !self.peerconnection.remoteDescription.sdp) {
            logger.log(logger.level.INFO, "IrisRtcSession", "check local and remote sdp");

            return;
        }

        var mySdp = new SDP(self.peerconnection.localDescription.sdp);
        var remoteSDP = self.peerconnection.remoteDescription.sdp;

        var remoteDesc = new RTCSessionDescription({ "sdp": remoteSDP, "type": "offer" });

        self.peerconnection.setRemoteDescription(remoteDesc, function() {
            logger.log(logger.level.INFO, "IrisRtcSession", "setRemoteDescription success");

            self.peerconnection.createAnswer(function(answer) {
                logger.log(logger.level.INFO, "IrisRtcSession", "createAnswer success");

                self.peerconnection.setLocalDescription(answer, function() {
                    logger.log(logger.level.INFO, "IrisRtcSession", "setLocalDescription success");

                    var newSdp = new SDP(self.peerconnection.localDescription.sdp);

                    if (!(self.peerconnection.signalingState == 'stable' &&
                            self.peerconnection.iceConnectionState == 'connected')) {
                        logger.log(logger.level.INFO, "Too early to send updates");
                        return;
                    }

                    var sdpDiffer = new SDPDiffer(newSdp, mySdp);

                    var data = {
                        "sdp": sdpDiffer,
                        "to": self.to,
                        "traceId": self.config.traceId,
                    };
                    self.connection.xmpp.sendSourceRemove(sdpDiffer, data);
                    self.sendEvent("SDK_SendSourceRemove", { to: self.to });

                }, function(error) {
                    logger.log(logger.level.ERROR, "IrisRtcSession", "Failed to setLocalDescription ", error);
                });
            }, function(error) {
                logger.log(logger.level.ERROR, "IrisRtcSession", "Failed to createAnswer ", error);
            }, self.pcConstraints);
        }, function(error) {
            logger.log(logger.level.ERROR, "IrisRtcSession", "Failed to setRemoteDescription ", error);

        });
    } catch (error) {
        logger.log(logger.level.ERROR, "IrisRtcSession",
            " Failed to send source add " + error);
    }
};

/**
 * @private
 */
IrisRtcSession.prototype.updateAddSourcesQueue = function() {
    logger.log(logger.level.INFO, "IrisRtcSession", "updateAddSourcesQueue called ");

    var signalingState = this.peerconnection.signalingState;
    var iceConnectionState = this.peerconnection.iceConnectionState;
    if (signalingState === 'stable' && iceConnectionState === 'connected') {
        logger.log(logger.level.INFO, "IrisRtcSession", "updateAddSourcesQueue :: Resume");
        this.addSourcesQueue.resume();
    } else {
        logger.log(logger.level.INFO, "IrisRtcSession", "updateAddSourcesQueue :: Pause ");
        this.addSourcesQueue.pause();
    }
};


/**
 * Add Stream to webrtc based on the call
 * @param {object} localStream - Local stream to be added to conference
 * @private
 */
IrisRtcSession.prototype.addStream = function(localStream) {

    logger.log(logger.level.INFO, "IrisRtcSession", "addStream called ", localStream);

    // assign self
    var self = this;

    //For receive only call don't add locastream to peerconnection
    if (self.config.stream == "recvonly") {
        return;
    }

    // Add stream to peerconnection
    if (localStream) {
        if (this.peerconnection != null) {
            this.peerconnection.addStream(localStream);
            logger.log(logger.level.VERBOSE, "IrisRtcSession", "Stream is successfully added to peerconnection");
        } else {
            logger.log(logger.level.ERROR, "IrisRtcSession", " Peerconnection is null !!, Failed to add stream ");
        }
    } else {
        logger.log(logger.level.ERROR, "IrisRtcSession", " locaStream is null !! ");
    }
};

/**
 * Removes streams from conference
 * @param {object} localStream - Stream to be removed from the conference
 * @private
 */
IrisRtcSession.prototype.removeStream = function(locaStream) {
    logger.log(logger.level.INFO, "IrisRtcSession", "removeStream called");
    var self = this;

    try {
        if (locaStream && this.peerconnection) {
            self.locaStream = locaStream;
            if (this.peerconnection.removeStream) {
                this.peerconnection.removeStream(locaStream);
            }
        } else {
            logger.log(logger.level.ERROR, "IrisRtcSession",
                " localStream or Peerconnection is null !! ");
        }

    } catch (error) {
        logger.log(logger.level.ERROR, "IrisRtcSession",
            " Error while remove stream from conference ");
    }
};

/**
 * This API allows user to switch the stream between the camera, this can used for
 * screen share with the constraints having source id for desktop sourceid
 * @param {string} roomId - 
 * @param {object} irisRtcStream - IrisRtcStream object
 * @param {json} streamConfig  - Stream config json example as mentioned above
 * @param {string} streamConfig.streamType - Type of stream audio or video
 * @param {string} streamConfig.resolution - Resolution for the video
 * @param {json} streamConfig.constraints - Media Constraints 
 * @param {string} streamConfig.constraints.audio - Media constrainsts for audio
 * @param {string} streamConfig.constraints.video - Media constrainsts for video
 * @param {string} streamConfig.screenShare - True if it is a screen share call
 * @public
 */
IrisRtcSession.prototype.switchStream = function(roomId, irisRtcStream, streamConfig) {
    try {
        var self = this;

        if (roomId != self.config.roomId) {
            logger.log(logger.level.ERROR, "IrisRtcSession", "switchStream :: Wrong roomId, this roomId : " +
                self.config.roomId + " Received roomId : " + roomId);
            return;
        }

        logger.log(logger.level.INFO, "IrisRtcSession", "Switch stream with new stream for config " + JSON.stringify(streamConfig));

        if (streamConfig.screenShare) {
            logger.log(logger.level.INFO, "IrisRtcSession", "Switch stream for screen share " + JSON.stringify(streamConfig));
        }

        // Remove the present stream from the conference
        self.removeStream(self.localStream);

        // Send source remove
        self.sendSourceRemove();

        // Stop the present stream
        irisRtcStream.stopMediaStream(self.localStream);

        // Create a new stream with new config
        irisRtcStream.createStream(streamConfig).then(function(stream) {
            if (stream) {
                self.localStream = stream;
                if (streamConfig.screenShare) {
                    logger.log(logger.level.INFO, "IrisRtcSession", "switchStream : Sharing the screen");
                    irisRtcStream.createStream({ streamType: "audio" }).then(function(audioStream) {
                        if (audioStream) {
                            var audioTrack = audioStream.getAudioTracks()[0];
                            if (audioTrack) {
                                logger.log(logger.level.VERBOSE, "IrisRtcSession", "Audio Track is received ", audioTrack);
                                stream.addTrack(audioTrack);
                                self.addStream(stream);
                                self.sendEvent("SDK_SwitchStream", streamConfig);
                                self.sendSwitchStreamAdd();
                            }
                        }
                    });
                } else {
                    logger.log(logger.level.INFO, "IrisRtcSession", "switchStream : Swicthing to local media stream");
                    self.addStream(stream);
                    self.sendSwitchStreamAdd();
                }
            }
        }).catch(function(error) {
            logger.log(logger.level.ERROR, "IrisRtcSession",
                "Failed to switch the stream with ", error);
        });
    } catch (error) {
        logger.log(logger.level.ERROR, "IrisRtcSession",
            "Failed to switch the stream with ", error);
    }
};

/**
 * @private
 */
IrisRtcSession.prototype.sendSwitchStreamAdd = function() {
    logger.log(logger.level.VERBOSE, "IrisRtcSession", "sendSwitchStreamAdd :: Stream is sent");

    var self = this;

    var remoteSDP = self.peerconnection.remoteDescription.sdp;

    var remoteDesc = new RTCSessionDescription({ "sdp": remoteSDP, "type": "offer" });

    self.peerconnection.setRemoteDescription(remoteDesc, function() {
        logger.log(logger.level.INFO, "IrisRtcSession", "setRemoteDescription success");
        //Send Session Accept
        self.peerconnection.createAnswer(function(answer) {
            logger.log(logger.level.INFO, "IrisRtcSession", "createAnswer Successfull");

            // Send the answer
            var data = {
                "sdp": answer.sdp,
                "to": self.to,
                "traceId": self.config.traceId,
            };

            // Send session-accept
            self.connection.xmpp.sendSessionAccept(data);
            self.sendEvent("SDK_XMPPJingleSessionAcceptSentForSwitchStream", data);

            //save the local sdp
            self.localSdp = answer.sdp;

            // Set the local description
            self.peerconnection.setLocalDescription(answer, function() {
                logger.log(logger.level.INFO, "IrisRtcSession", "setLocalDescription success");

                //DONE

            });

        }, function(error) {
            logger.log(logger.level.INFO, "IrisRtcSession", "createAnswer failed ", error);
        }, self.pcConstraints);
    }, function(error) {
        logger.log(logger.level.INFO, "IrisRtcSession", "setRemoteDescription failed ", error);
    })
};

/** 
 *  Mute or unmute local video
 * @param {string} roomId - Unique Id for participants in a room
 * @public
 */
IrisRtcSession.prototype.videoMuteToggle = function(roomId) {

    try {
        var self = this;

        if (roomId != self.config.roomId) {
            logger.log(logger.level.ERROR, "IrisRtcSession", "videoMuteToggle :: Wrong roomId, this roomId : " +
                self.config.roomId + " Received roomId : " + roomId);
            return;
        }
        if (self.localStream && self.localStream.getVideoTracks().length >= 1 && self.localStream.getVideoTracks()[0]) {
            this.isVideoMuted = this.localStream.getVideoTracks()[0].enabled;
            logger.log(logger.level.INFO, "IrisRtcSession", "videoMuteToggle : Video Mute : " + !this.isVideoMuted);
            this.config.videomuted = this.isVideoMuted.toString();

            if (this.isVideoMuted) {
                this.localStream.getVideoTracks()[0].enabled = false;
            } else {
                this.localStream.getVideoTracks()[0].enabled = true;
            }

            this.isVideoMuted = this.localStream.getVideoTracks()[0].enabled;
            logger.log(logger.level.INFO, "IrisRtcSession", "videoMuteToggle : Video Mute : " + !this.isVideoMuted);
            if (this.connection && this.connection.xmpp) {
                this.sendEvent("SDK_VideoMuteToggle", { "isVideoMuted": this.isVideoMuted });
                this.connection.xmpp.stopPresenceAlive(this.config.roomId);
                this.connection.xmpp.sendPresence(this.config);
                this.connection.xmpp.sendPresenceAlive(this.config);
            } else {
                logger.log(logger.level.WARNING, "IrisRtcSession", "videoMuteToggle : Check if session is created");
            }
        } else {
            logger.log(logger.level.WARNING, "IrisRtcSession", "videoMuteToggle: No video to mute");
        }
    } catch (error) {
        logger.log(logger.level.ERROR, "IrisRtcSession", "videoMuteToggle : Failed to mute video");

    }
};

/**
 * Mute or Unmute local audio
 * @param {string} roomId - Unique Id for participants in a room
 * @public
 */
IrisRtcSession.prototype.audioMuteToggle = function(roomId) {

    try {
        var self = this;

        if (roomId != self.config.roomId) {
            logger.log(logger.level.ERROR, "IrisRtcSession", "audioMuteToggle :: Wrong roomId, this roomId : " +
                self.config.roomId + " Received roomId : " + roomId);
            return;
        }

        if (self.localStream && self.localStream.getAudioTracks().length >= 1 && self.localStream.getAudioTracks()[0]) {
            this.isAudioMuted = this.localStream.getAudioTracks()[0].enabled;
            logger.log(logger.level.INFO, "IrisRtcSession", "audioMuteToggle :: Audio Mute : " + this.isAudioMuted);

            this.config.audiomuted = this.isAudioMuted.toString();
            if (this.isAudioMuted) {
                this.localStream.getAudioTracks()[0].enabled = false;
            } else {
                this.localStream.getAudioTracks()[0].enabled = true;
            }

            if (this.connection && this.connection.xmpp) {
                this.sendEvent("SDK_AudioMuteToggle", { "isAudioMuted": this.isAudioMuted });
                this.connection.xmpp.stopPresenceAlive(this.config.roomId);
                this.connection.xmpp.sendPresence(this.config);
                this.connection.xmpp.sendPresenceAlive(this.config);
            } else {
                logger.log(logger.level.WARNING, "IrisRtcSession", "audioMuteToggle: Check if session is created");
            }

        } else {
            logger.log(logger.level.WARNING, "IrisRtcSession", "audioMuteToggle: No audio to mute");
        }

    } catch (error) {
        logger.log(logger.level.ERROR, "IrisRtcSession", "audioMuteToggle : Failed to mute audio");

    }
};

/**
 * API to set dispaly name for the user
 * @param {string} roomId - Room ID
 * @param {string} name - Name for the user
 * @public
 */
IrisRtcSession.prototype.setDisplayName = function(roomId, name) {

    if (this.config && roomId != this.config.roomId) {
        logger.log(logger.level.ERROR, "IrisRtcSession", "setDisplayName :: Wrong roomId, this roomId : " +
            this.config.roomId + " Received roomId : " + roomId);
        return;
    }

    if (!name) {
        logger.log(logger.level.ERROR, "IrisRtcSession", "setDisplayName : name is empty");
        return;
    } else if (this.connection && this.connection.xmpp) {
        this.config.name = name;
        this.connection.xmpp.stopPresenceAlive(this.config.roomId);
        this.connection.xmpp.sendPresence(this.config);
        this.connection.xmpp.sendPresenceAlive(this.config);
    } else {
        logger.log(logger.level.ERROR, "IrisRtcSession", "setDisplayName : Check if session is created");
    }
};

/**
 * Read the ssrc info and create a map of ssrc and their owners
 * @private
 */
IrisRtcSession.prototype.readSsrcs = function(data) {
    var self = this;
    // self.ssrcOwners = {};
    logger.log(logger.level.VERBOSE, "IrisRtcSession", "readSsrcs");

    if (!data) {
        logger.log(logger.level.ERROR, "IrisRtcSession", "Failed to read data it is null");
        return;
    }

    if (!data.jingle) {
        logger.log(logger.level.ERROR, "IrisRtcSession", "Failed to read jingle it is null");
        return;
    }

    var jingle = data.jingle;

    var contents = jingle.getChildren('content');

    if (!contents) {
        logger.log(logger.level.ERROR, "IrisRtcSession", "Failed to read jingle it is null");
        return;
    }

    contents.forEach(function(content, idx) {
        //var name = content.attrs.name;
        //var mediaType = "";

        var desc = content.getChild('description');
        if (desc == null)
            return;

        desc.getChildren("source", "urn:xmpp:jingle:apps:rtp:ssma:0").forEach(function(source) {
            var ssrc = source.attrs.ssrc;
            source.getChildren("ssrc-info", "http://jitsi.org/jitmeet").forEach(function(ssrcInfo) {
                var owner = ssrcInfo.attrs.owner;
                self.ssrcOwners[ssrc] = owner;
            });
        });
    });
    logger.log(logger.level.INFO, "IrisRtcSession", "readSsrcs :: " + JSON.stringify(self.ssrcOwners));

};

/**
 * Get the stream id from the remote stream received
 * @private
 */
IrisRtcSession.prototype.getStreamID = function(stream) {
    logger.log(logger.level.VERBOSE, "IrisRtcSession", "getStreamID");

    try {
        if (RtcBrowserType.isChrome()) {
            return SDPUtil.filter_special_chars(stream.id);
        } else if (RtcBrowserType.isFirefox()) {
            var id = stream.id;
            if (!id) {
                var tracks = stream.getVideoTracks();
                if (!tracks || tracks.length === 0) {
                    tracks = stream.getAudioTracks();
                }
                id = tracks[0].id;
            }
            return SDPUtil.filter_special_chars(id);
        }
    } catch (error) {
        logger.log(logger.level.ERROR, "IrisRtcSession", "getStreamID ", error);
    }
};

/**
 * This API allows user put a PSTN call on hold
 * @param {string} roomId - room id
 * @param {string} participantJid - Jid of the pstn participant
 * @public
 */
IrisRtcSession.prototype.pstnHold = function(roomId, participantJid) {
    try {

        if (this.config && roomId != this.config.roomId) {
            logger.log(logger.level.ERROR, "IrisRtcSession", "pstnHold :: Wrong roomId, this roomId : " +
                this.config.roomId + " Received roomId : " + roomId);
            return;
        }

        logger.log(logger.level.INFO, "IrisRtcSession", "pstnHold :: roomId : " + roomId +
            " participantJid : " + participantJid);

        if (this.connection && this.connection.xmpp && this.config.roomId == roomId) {
            this.connection.xmpp.sendHold(this.config, participantJid);
        } else {
            logger.log(logger.level.ERROR, "IrisRtcSession", "pstnHold :: Session not created yet or roomId is different");
        }
    } catch (error) {
        logger.log(logger.level.ERROR, "IrisRtcSession", "pstnHold :: Session not created yet or roomId is different ", error);
    }
};

/**
 * This API allows user to unhold a PSTN call
 * @param {string} roomId - room id
 * @param {string} participantJid - Jid of the pstn participant 
 * @public
 */
IrisRtcSession.prototype.pstnUnHold = function(roomId, participantJid) {
    try {

        if (this.config && roomId != this.config.roomId) {
            logger.log(logger.level.ERROR, "IrisRtcSession", "pstnUnHold :: Wrong roomId, this roomId : " +
                this.config.roomId + " Received roomId : " + roomId);
            return;
        }

        logger.log(logger.level.INFO, "IrisRtcSession", "pstnUnHold :: roomId : " + roomId +
            " participantJid : " + participantJid);

        if (this.connection && this.connection.xmpp && this.config.roomId == roomId) {
            this.connection.xmpp.sendUnHold(this.config, participantJid);
        } else {
            logger.log(logger.level.ERROR, "IrisRtcSession", "pstnUnHold :: Session not created yet or roomId is different");
        }
    } catch (error) {
        logger.log(logger.level.ERROR, "IrisRtcSession", "pstnUnHold :: Session not created yet or roomId is different ", error);
    }
}

/**
 * This API allows user to merge two pstn calls
 * @param {string} roomId - Room Id
 * @param {string} firstParticipantJid - Jid of the participant in first call
 * @param {string} secondParticipantJid - Jid of the participant in second call
 * @public
 */
IrisRtcSession.prototype.pstnMerge = function(roomId, firstParticipantJid, secondParticipantJid) {
    try {

        if (this.config && roomId != this.config.roomId) {
            logger.log(logger.level.ERROR, "IrisRtcSession", "pstnMerge :: Wrong roomId, this roomId : " +
                this.config.roomId + " Received roomId : " + roomId);
            return;
        }

        logger.log(logger.level.INFO, "IrisRtcSession", "pstnMerge :: roomId : " + roomId +
            " firstParticipantJid: " + firstParticipantJid +
            " secondParticipantJid : " + secondParticipantJid);

        if (this.connection && this.connection.xmpp && this.config.roomId == roomId) {
            this.connection.xmpp.sendMerge(this.config, firstParticipantJid, secondParticipantJid);
        } else {
            logger.log(logger.level.ERROR, "IrisRtcSession", "pstnMerge :: Session not created yet or roomId is different");
        }
    } catch (error) {
        logger.log(logger.level.ERROR, "IrisRtcSession", "pstnMerge :: Session not created yet or roomId is different ", error);

    }
}

/**
 * This API allows to user to hang up the PSTN call
 * @param {string} roomId - Room ID
 * @param {string} participantJid -  Jid of the pstn participant
 * @public
 */
IrisRtcSession.prototype.pstnHangup = function(roomId, participantJid) {
    try {

        if (this.config && roomId != this.config.roomId) {
            logger.log(logger.level.ERROR, "IrisRtcSession", "pstnHangup :: Wrong roomId, this roomId : " +
                this.config.roomId + " Received roomId : " + roomId);
            return;
        }

        logger.log(logger.level.INFO, "IrisRtcSession", "pstnHangup :: roomId : " + roomId +
            " participantJid : " + participantJid);

        if (this.connection && this.connection.xmpp && this.config.roomId == roomId) {
            this.connection.xmpp.sendHangup(this.config, participantJid);
        } else {
            logger.log(logger.level.ERROR, "IrisRtcSession", "pstnHangup :: Session not created yet or roomId is different");
        }
    } catch (error) {
        logger.log(logger.level.ERROR, "IrisRtcSession", "pstnHangup :: Session not created yet or roomId is different ", error);
    }
};

/**
 * This API allows user to add a participant to the ongoing PSTN call
 * @param {string} roomId - Unique id for the room
 * @param {E.164} toTN - Telephone number of callee in e.164 format
 * @param {string} toRoutingId - Routing id of the callee
 * @public
 */
IrisRtcSession.prototype.addPSTNParticipant = function(roomId, toTN, toRoutingId) {
    try {

        logger.log(logger.level.INFO, "IrisRtcSession", "addPSTNParticipant : roomId:" + roomId +
            " toTN : " + toTN + " toRoutingId : " + toRoutingId);

        if (this.config && roomId != this.config.roomId) {
            logger.log(logger.level.ERROR, "IrisRtcSession", "addPSTNParticipant :: Wrong roomId, this roomId : " +
                this.config.roomId + " Received roomId : " + roomId);
            return;
        }

        if (!this.connection || this.state != IrisRtcSession.CONNECTED) {
            logger.log(logger.level.ERROR, "IrisRtcSession", "addPSTNParticipant :: " +
                "There is no currently active session to add participant ");
            return;
        }

        if (this.connection && this.state == IrisRtcSession.CONNECTED) {
            var data = {
                toTN: toTN,
                toRoutingId: toRoutingId,
                fromTN: this.config.fromTN,
                focusJid: this.config.focusJid,
                roomId: this.config.roomId,
                rtcServer: this.config.rtcServer,
                eventType: this.config.eventType,
                traceId: this.config.traceId,
                roomtoken: this.config.roomtoken,
                roomtokenexpirytime: this.config.roomtokenexpirytime,
                rootNodeId: this.config.rootNodeId,
                childNodeId: this.config.childNodeId
            }
            this.connection.xmpp.sendRayo(data);
        } else {
            logger.log(logger.level.ERROR, "IrisRtcSession", "addPSTNParticipant : Failed to dial number " + toTN);
        }
    } catch (error) {
        logger.log(logger.level.ERROR, "IrisRtcSession", "addPSTNParticipant : Dial number failed with error ", error);
    }
}


/**
 * onSessionCreated callback
 * @private
 */
IrisRtcSession.prototype.onCreated = function(roomId) {
    this.onSessionCreated(roomId);
};

/**
 * @private
 */
IrisRtcSession.prototype.onJoined = function(roomId, myJid) {

    if (!this.config.useBridge || (this.config.type == "chat"))
        this.connection.xmpp.sendPresenceAlive(this.config);
    this.onSessionJoined(roomId, myJid);
}


/**
 * onParticipantJoined callback
 * @private
 */
IrisRtcSession.prototype.onParticipantJoined = function(roomId, participantJid) {
    this.onSessionParticipantJoined(roomId, participantJid);
};

/**
 * onParticipantLeft callback
 * @private
 */
IrisRtcSession.prototype.onParticipantLeft = function(roomId, participantJid, closeSession) {
    if ((participantJid.indexOf('f0cus') > 0) && (this.config.type !== "chat")) {
        // Send Conference IQ again if focus leaves room
        this.connection.xmpp.stopPresenceAlive(this.config.roomId);
        this.connection.xmpp.sendAllocate(this.config);
    } else {
        this.onSessionParticipantLeft(roomId, participantJid, closeSession);
    }
};

/**
 * @private
 */
IrisRtcSession.prototype.onVideoMuted = function(id, videoMute) {
    var self = this;
    Object.keys(this.participants).forEach(function(jid) {
        if (jid == id) {
            if (!(self.participants[jid].videomuted == videoMute)) {
                self.participants[jid].videomuted = videoMute;
                self.onParticipantVideoMuted(self.config.roomId, id, videoMute);
            }
        }
    });
};

/**
 * @private
 */
IrisRtcSession.prototype.onAudioMuted = function(id, audioMute) {
    var self = this;
    Object.keys(this.participants).forEach(function(jid) {
        if (jid == id) {
            if (!(self.participants[jid].audiomuted == audioMute)) {
                self.participants[jid].audiomuted = audioMute;
                self.onParticipantAudioMuted(self.config.roomId, id, audioMute);
            }
        }
    });
};

/**
 * @private
 */
IrisRtcSession.prototype.onParticipantAudioMuted = function(roomId, jid, audioMute) {
    this.onSessionParticipantAudioMuted((roomId, jid, audioMute))
};

/**
 * @private
 */
IrisRtcSession.prototype.onParticipantVideoMuted = function(roomId, jid, videoMute) {
    this.onSessionParticipantVideoMuted(roomId, jid, videoMute);
};

/**
 * Called when participant's auido is muted
 * @param {string} roomId - Unique Id for participants
 * @param {string} jid - Unique jid of the participant
 * @param {string} audioMute - Status of audio. True - Muted. False - Not muted
 * @public
 */
IrisRtcSession.prototype.onSessionParticipantAudioMuted = function(roomId, jid, audioMute) {};

/**
 * Called when participant's video is muted
 * @param {string} roomId - Unique Id for participants
 * @param {string} jid - Unique jid of the participant
 * @param {string} videoMute - Status of video. True - Muted. False - Not muted
 * @public
 */
IrisRtcSession.prototype.onSessionParticipantVideoMuted = function(roomId, jid, videoMute) {};

/**
 * @param {string} roomId - Unique Id for participants
 * @param {object} stream - Media stream of remote participant
 * 
 */
IrisRtcSession.prototype.onRemoteStream = function(roomId, stream) {}



/**
 * @private
 */
IrisRtcSession.prototype.onDisplayNameChange = function(id, nick) {
    var self = this;
    Object.keys(this.participants).forEach(function(jid) {
        if (jid == id) {
            if (!(self.participants[jid].nick == nick)) {
                self.participants[jid].nick = nick;
                self.onUserProfileChange(self.config.roomId, id, { "displayName": nick });
            }
        }
    });
};

/**
 * @private
 */
IrisRtcSession.prototype.onUserStatusChange = function(id, status) {
    var self = this;
    Object.keys(self.participants).forEach(function(jid) {
        if (jid == id) {
            self.participants[jid].status = status;
            self.onUserProfileChange(self.config.roomId, id, { "status": status });
        }
    });
};

/**
 * Called when there is a change in uset profile. ex.Dispalyname
 * @param {string} roomId - Unique Id for room
 * @param {string} jid - Unique jid of the user
 * @param {json} profileJson - Json with user profile 
 * @param {string} profileJson.displayName - Name of the participant
 * @param {string} profileJson.status - Status of pstn call
 * @public
 */
IrisRtcSession.prototype.onUserProfileChange = function(roomId, jid, profileJson) {
    //
};


/**
 * Called to report an SDK event or an error
 * @private
 */
IrisRtcSession.prototype.sendEvent = function(event, details) {

    var eventdata = {
        "type": "session",
        "event": event,
        "roomId": (this.config && this.config.roomId) ? this.config.roomId : details.roomId ? details.roomId : "NA",
        "routingId": (this.config && this.config.routingId) ? this.config.routingId : details.routingId ? details.routingId : "NA",
        "traceId": (this.config && this.config.traceId) ? this.config.traceId : details.traceId ? details.traceId : "NA",
        "details": details
    };

    this.onEvent(eventdata.roomId, eventdata);

    this.sdkStats.eventLogs(event, eventdata);
};

/**
 * Called when connection has an event
 * @param {string} roomId - Room ID
 * @param {json} event - SDK events
 * @private
 */
IrisRtcSession.prototype.onEvent = function(roomId, event) {
    // 
};

/**
 * Function to remove codec from sdp
 * @param {string} codec - codec to be preferred
 * @param {string} orgsdp - SDP
 * @private
 */
function removeCodec(orgsdp, codec) {
    var internalFunc = function(sdp) {
        var codecre = new RegExp('(a=rtpmap:(\\d*) ' + codec + '\/90000\\r\\n)');
        var rtpmaps = sdp.match(codecre);
        if (rtpmaps == null || rtpmaps.length <= 2) {
            return sdp;
        }
        var rtpmap = rtpmaps[2];
        var modsdp = sdp.replace(codecre, "");
        var rtcpre = new RegExp('(a=rtcp-fb:' + rtpmap + '.*\r\n)', 'g');
        modsdp = modsdp.replace(rtcpre, "");
        var fmtpre = new RegExp('(a=fmtp:' + rtpmap + '.*\r\n)', 'g');
        modsdp = modsdp.replace(fmtpre, "");
        var aptpre = new RegExp('(a=fmtp:(\\d*) apt=' + rtpmap + '\\r\\n)');
        var aptmaps = modsdp.match(aptpre);
        var fmtpmap = "";
        if (aptmaps != null && aptmaps.length >= 3) {
            fmtpmap = aptmaps[2];
            modsdp = modsdp.replace(aptpre, "");
            var rtppre = new RegExp('(a=rtpmap:' + fmtpmap + '.*\r\n)', 'g');
            modsdp = modsdp.replace(rtppre, "");
        }
        var videore = /(m=video.*\r\n)/;
        var videolines = modsdp.match(videore);
        if (videolines != null) {
            //If many m=video are found in SDP, this program doesn't work.
            var videoline = videolines[0].substring(0, videolines[0].length - 2);
            var videoelem = videoline.split(" ");
            var modvideoline = videoelem[0];
            for (var i = 1; i < videoelem.length; i++) {
                if (videoelem[i] == rtpmap || videoelem[i] == fmtpmap) {
                    continue;
                }
                modvideoline += " " + videoelem[i];
            }
            modvideoline += "\r\n";
            modsdp = modsdp.replace(videore, modvideoline);
        }
        return internalFunc(modsdp);
    };
    return internalFunc(orgsdp);
}

/**
 * Function to prefer codec from sdp
 * @param sdp - original sdp
 * @returns modified sdp with preferred codec
 * @private
 */
function preferH264(sdp) {
    logger.log(logger.level.INFO, "IrisRtcSession :: preferH264");

    var sdpLines = sdp.split('\r\n');

    for (var i = 0; i < sdpLines.length; i++) {
        if (sdpLines[i].search('m=video') !== -1) {
            var mLineIndex = i;
            break;
        }
    }

    if (mLineIndex === null) return sdp;

    for (i = 0; i < sdpLines.length; i++) {
        if ((sdpLines[i].search('H264/90000') !== -1) || (sdpLines[i].search('h264/90000') !== -1)) {
            var opusPayload = extractSdp(sdpLines[i], /:(\d+) H264\/90000/i);
            if (opusPayload)
                sdpLines[mLineIndex] = setDefaultCodec(sdpLines[mLineIndex], opusPayload);
            break;
        }
    }

    sdpLines = removeCN(sdpLines, mLineIndex);

    sdp = sdpLines.join('\r\n');
    return sdp;
};

/**
 * @private
 */
function extractSdp(sdpLine, pattern) {
    var result = sdpLine.match(pattern);
    return (result && result.length == 2) ? result[1] : null;
};

/**
 * @private
 */
function setDefaultCodec(mLine, payload) {
    var elements = mLine.split(' ');
    var newLine = new Array();
    var index = 0;
    for (var i = 0; i < elements.length; i++) {
        if (index === 3) newLine[index++] = payload;
        if (elements[i] !== payload) newLine[index++] = elements[i];
    }
    return newLine.join(' ');
};

/**
 * @private
 */
function removeCN(sdpLines, mLineIndex) {
    var mLineElements = sdpLines[mLineIndex].split(' ');
    for (var i = sdpLines.length - 1; i >= 0; i--) {
        var payload = extractSdp(sdpLines[i], /a=rtpmap:(\d+) CN\/\d+/i);
        if (payload) {
            var cnPos = mLineElements.indexOf(payload);
            if (cnPos !== -1) mLineElements.splice(cnPos, 1);
            sdpLines.splice(i, 1);
        }
    }
    sdpLines[mLineIndex] = mLineElements.join(' ');
    return sdpLines;
};

/**
 * Prefer ISAC audio codec
 * @private
 */
function preferISAC(sdp) {
    logger.log(logger.level.INFO, "IrisRtcSession :: preferISAC");

    var sdpLines = sdp.split('\r\n');

    for (var i = 0; i < sdpLines.length; i++) {
        if (sdpLines[i].search('m=audio') !== -1) {
            var mLineIndex = i;
            break;
        }
    }

    if (mLineIndex === null) return sdp;

    for (i = 0; i < sdpLines.length; i++) {
        if (sdpLines[i].search('ISAC/16000') !== -1) {
            var isacPayload = extractSdp(sdpLines[i], /:(\d+) ISAC\/16000/i);
            if (isacPayload)
                sdpLines[mLineIndex] = setDefaultCodec(sdpLines[mLineIndex], isacPayload);
            break;
        }
    }
    sdpLines = removeCN(sdpLines, mLineIndex);

    for (i = 0; i < sdpLines.length; i++) {
        if (sdpLines[i].search('ISAC/32000') !== -1) {
            var isacPayload = extractSdp(sdpLines[i], /:(\d+) ISAC\/32000/i);
            if (isacPayload)
                sdpLines[mLineIndex] = setISAC3200Codec(sdpLines[mLineIndex], isacPayload);
            break;
        }
    }
    sdpLines = removeCN(sdpLines, mLineIndex);

    sdp = sdpLines.join('\r\n');

    return sdp;
};

/**
 * @private
 */
function setISAC3200Codec(mLine, payload) {
    var elements = mLine.split(' ');
    var newLine = new Array();
    var index = 0;
    for (var i = 0; i < elements.length; i++) {
        if (index === 4) newLine[index++] = payload;
        if (elements[i] !== payload) newLine[index++] = elements[i];
    }
    return newLine.join(' ');
};

/**
 * 
 * @param {object} sdp 
 * @private
 */
function preferOpus(sdp) {
    logger.log(logger.level.INFO, "IrisRtcSession :: preferISAC");

    var sdpLines = sdp.split('\r\n');

    for (var i = 0; i < sdpLines.length; i++) {
        if (sdpLines[i].search('m=audio') !== -1) {
            var mLineIndex = i;
            break;
        }
    }

    if (mLineIndex === null) return sdp;

    for (i = 0; i < sdpLines.length; i++) {
        if (sdpLines[i].search('opus/48000/2') !== -1) {
            var isacPayload = extractSdp(sdpLines[i], /:(\d+) opus\/48000\/2/i);
            if (isacPayload)
                sdpLines[mLineIndex] = setDefaultCodec(sdpLines[mLineIndex], isacPayload);
            break;
        }
    }
    sdpLines = removeCN(sdpLines, mLineIndex);

    sdp = sdpLines.join('\r\n');

    return sdp;
};

/**
 * 
 * @param {object} self - IrisRtcSession object
 * @param {object} audioTrack - AudioTrack of local stream
 * @param {object} peerconnection - Peer Connection object
 * @private
 */
function DTMFManager(self, audioTrack, peerconnection) {
    try {
        pc = peerconnection;

        if (!pc) {
            logger.log(logger.level.ERROR, "IrisRtcSession", 'DTMFManager :: Peerconnection is null');
            return;
        }

        if (!audioTrack) {
            logger.log(logger.level.ERROR, "IrisRtcSession", 'DTMFManager :: No audio track');
            return;
        }

        if (pc.getSenders) {
            self.dtmfSender = pc.getSenders()[0].dtmf;
        } else {
            logger.log(logger.level.INFO, "IrisRtcSession", "DTMFManager :: " +
                "Your browser doesn't support RTCPeerConnection.getSenders(), so " +
                "falling back to use <strong>deprecated</strong> createDTMFSender() " +
                "instead.");
            self.dtmfSender = pc.createDTMFSender(audioTrack);
        }
        //dtmfSender.ontonechange = handleToneChangeEvent;
        logger.log(logger.level.INFO, "IrisRtcSession", 'DTMFManager :: Initialized DTMFSender');

    } catch (error) {
        logger.log(logger.level.ERROR, "IrisRtcSession", 'DTMFManager :: Failed to initialize DTMF sender');

    }

}

/**
 * 
 * Monitor presence messages from remote participants
 * @private
 */
IrisRtcSession.prototype.presenceMonitor = function() {
    var self = this;
    try {
        logger.log(logger.level.VERBOSE, "IrisRtcSession", 'presenceMonitor');

        this.monitorIntervalValue = setInterval(function() {
            self.checkPresenceElapsedTime();
        }, rtcConfig.json.presMonitorInterval);

    } catch (error) {
        logger.log(logger.level.ERROR, "IrisRtcSession", 'presenceMonitor :: Presence monitoring failed ', error);
    }
};

/**
 * Check if last presence is received 30seconds ago, if so raise onSessionParticipantNotResponding event
 * @private
 */
IrisRtcSession.prototype.checkPresenceElapsedTime = function() {
    var self = this;

    try {
        var currTime = new Date();
        logger.log(logger.level.VERBOSE, "IrisRtcSession", 'checkPresenceElapsedTime');

        Object.keys(self.participants).forEach(function(jid) {

            var presenceReceivedTimeDiff = (currTime - self.participants[jid].lastPresenceReceived) / 1000;

            if (presenceReceivedTimeDiff > 30) {
                logger.log(logger.level.VERBOSE, "IrisRtcSession", 'checkPresenceElapsedTime :: currentTime :: ' + currTime);
                logger.log(logger.level.VERBOSE, "IrisRtcSession", 'checkPresenceElapsedTime :: lastPresenceReceived :: ' + self.participants[jid].lastPresenceReceived);
                logger.log(logger.level.INFO, "IrisRtcSession", 'checkPresenceElapsedTime :: presenceReceivedTimeDiff :: ' + presenceReceivedTimeDiff);

                self.sendEvent("SDK_ParticipantNotResponding", { "presenceReceivedTimeDiff": presenceReceivedTimeDiff, "jid": jid });

                // Throw an event to client with the particpantJid who is not sending presence
                self.onSessionParticipantNotResponding(self.config.roomId, jid);
            } else {
                //
            }
        });

    } catch (error) {
        logger.log(logger.level.ERROR, "IrisRtcSession", 'presenceMonitor :: Presence monitoring failed ', error);
    }
};

/**
 * @param {string} roomId - Room Id
 * @param {string} tone - DTMF tone
 * @param {string} duration - duration of the tone
 * @param {string} interToneGap - inter tone gap 
 * @public
 */
IrisRtcSession.prototype.sendDTMFTone = function(roomId, tone, duration, interToneGap) {
    try {

        if (this.config && roomId != this.config.roomId) {
            logger.log(logger.level.ERROR, "IrisRtcSession", "sendDTMFTone :: Wrong roomId, this roomId : " +
                this.config.roomId + " Received roomId : " + roomId);
            return;
        }

        if (this.dtmfSender) {
            logger.log(logger.level.INFO, "IrisRtcSession", 'sendDTMFTone :: sending DTMF tone :: tone ' +
                tone + " duration " + duration + " interToneGap " + interToneGap);

            if (70 > duration || duration > 6000) {
                logger.log(logger.level.INFO, "IrisRtcSession", "The duration provided (" + duration + ")" +
                    " is outside the range (70, 6000). Setting duration to 70")
                duration = 70;
            }

            if (interToneGap < 50) {
                logger.log(logger.level.INFO, "IrisRtcSession", "The intertone gap provided (" + interToneGap + ")" +
                    "is less than the minimum bound (50). Setting intertone gap to 50")
                interToneGap = 50;
            }

            this.dtmfSender.insertDTMF(tone, duration, interToneGap);
        } else {
            logger.log(logger.level.ERROR, "IrisRtcSession", 'DTMFManager :: DTMF sender not initialized');
        }
    } catch (error) {
        logger.log(logger.level.ERROR, "IrisRtcSession", 'DTMFManager :: DTMF sender not initialized : ', error);
    }
};


/**
 * This API is called to create a new Iris Rtc session or to join a incoming call. 
 * In case of anonymous call client application should pass <code>stream</code> having local media tracks for creating/joining a session.
 * In case of non-anonymous call client application should pass <code>config</code>, <code>connection</code> and <code>stream</code>.
 * For incoming calls client should pass notification information in <code>config</code> with the 
 * required parameters to join session.
 * 
 * This method makes call to event manager APIs /v1/xmpp/startmuc to get required roomId to join session. 
 * IrisToken is must for calling any event manager APIs.
 * For anonymous call <code>/v1/xmpp/startmuc</code> is called with <code>roomId</code>, <code>irisToken</code>, <code>routingId</code> of caller.<br/>
 * For non-anonymous calls <code>/v1/xmpp/startmuc</code> is called with <code>irisToken</code>, <code>routingId</code> of caller
 * and array of routingId's of <code>participants</code>.
 *
 * Internally /v1/xmpp/startmuc of event manager is responsible for posting notifications to server.<br/>
 *
 * @param {json} config - A json object having all parameters required to create a room
 * @param {string} config.type - Call type 'chat', 'video', 'audio' and 'pstn'
 * @param {string} config.roomId - Unique id of room between participants
 * @param {string} config.irisToken - Iris JWT token
 * @param {string} config.routingId - Routing id of the caller
 * @param {string} config.toTN - Telephone number of caller in E.164 fromat (Mandatory for pstn calls)
 * @param {string} config.fromTN - Telephone number of callee in E.164 fromat  (Mandatory for pstn calls)
 * @param {string} config.toRoutingId - Routing Id of callee (Mandatory for pstn calls)
 * @param {string} config.stream - 'sendonly' - For send only call, caller will not receive participant video
 *                                 'recvonly' - For receive only call, caller will receive participant video but can't send his video
 * @param {string} config.traceId - Unique time based UUID to identify call uniquely 
 * @param {string} config.sessionType - Session type 'create'
 * @param {string} config.publicId - Public id of the caller
 * @param {object} connection - IrisRtcConnection object
 * @param {object} stream - Local media stream
 * @public
 */
IrisRtcSession.prototype.createSession = function(sessionConfig, connection, stream) {
    var self = this;

    // var config = Object.assign({}, sessionConfig);
    // var config = sessionConfig;
    var config = JSON.parse(JSON.stringify(sessionConfig));

    logger.log(logger.level.INFO, "IrisRtcSession",
        " Create session with config " + JSON.stringify(config));

    if (!config || !connection || !connection.xmpp) {
        logger.log(logger.level.ERROR, "IrisRtcSession",
            " Invalid user config or rtc connection !! ");
    } else if (!config.roomId) {
        logger.log(logger.level.ERROR, "IrisRtcSession",
            " config.roomId cannot be empty");
        return;
    } else if (!config.type) {
        logger.log(logger.level.ERROR, "IrisRtcSession",
            " config.type parameter is missing");
        return;
    } else if (!config.irisToken) {
        logger.log(logger.level.ERROR, "IrisRtcSession",
            " config.irisToken parameter is missing");
        return;
    } else if (!config.routingId) {
        logger.log(logger.level.ERROR, "IrisRtcSession",
            " config.routingId parameter is missing");
        return;
    } else if (config.stream == "recvonly" && stream) {
        logger.log(logger.level.ERROR, "IrisRtcSession", "Stream is not required for recvonly calls");
        return;
    } else if ((config.type == "video" || config.type == "audio") && !stream && config.stream != "recvonly") {
        logger.log(logger.level.ERROR, "IrisRtcSession",
            " local media stream cannot be null for video or audio call ");
        return;
    } else if (config.type == "pstn" && (!config.toTN || !config.fromTN || !config.toRoutingId)) {
        logger.log(logger.level.ERROR, "IrisRtcSession",
            " For pstn calls toTN, fromTN and toRoutingId are mandatory parameters ");
        return;
    } else {

        if (config.type == "audio" && config.stream != "recvonly" && stream.getVideoTracks().length >= 1) {
            logger.log(logger.level.ERROR, "IrisRtcSession", "For audio call, send audio stream only");
            return;
        }

        if (config.type == "video" && config.stream != "recvonly" && stream.getVideoTracks().length < 1) {
            logger.log(logger.level.ERROR, "IrisRtcSession", "For video call, video stream is required");
            return;
        }

        //If no codec is specified default to h264
        if (!config.videoCodec)
            config.videoCodec = "h264";

        config.sessionType = "create";

        self.sendEvent("SDK_CreateSession", { roomId: config.roomId, routingId: config.routingId, traceId: config.traceId, type: config.type });

        self.localStream = stream;
        self.create(config, connection);
    }
};

/**
 * This API is called to join a Iris Rtc session incase of non-anonymous call.
 * For incoming calls client should pass notification information having required parameters to join session.<br/>
 * notification payload sent to this API must have <code>roomid</code>, <code>roomtoken</code> and <code>roomtokenexpirytime</code>.
 * @param {json} config - A json object having all parameters required to create a room
 * @param {object} connection - IrisRtcConnection object
 * @param {object} stream - Local media stream
 * @param {json} notificationPayload - Notification payload having roomid, roomtoken and roomtokenexpirytime
 * @public
 */
IrisRtcSession.prototype.joinSession = function(sessionConfig, connection, stream, notificationPayload) {
    var self = this;

    var config = JSON.parse(JSON.stringify(sessionConfig));

    logger.log(logger.level.INFO, "IrisRtcSession",
        " Join session with config " + JSON.stringify(config));

    if (!notificationPayload) {
        logger.log(logger.level.ERROR, "IrisRtcSession",
            " Invalid notificationPayload!! ");
    } else if (!config || !connection || !connection.xmpp) {
        logger.log(logger.level.ERROR, "IrisRtcSession",
            " Invalid user config or rtc connection !! ");
    } else if ((config.type == "video" || config.type == "audio") && !stream && config.stream != "recvonly") {
        logger.log(logger.level.ERROR, "IrisRtcSession",
            " local media stream cannot be null for video call ");
    } else if (!notificationPayload.roomId || !notificationPayload.roomtoken || !notificationPayload.roomtokenexpirytime) {
        logger.log(logger.level.ERROR, "IrisRtcSession",
            " RoomId, roomtoken and roomtokenexpirytime parameters must be presenet");
    } else {
        config.roomId = notificationPayload.roomId;
        config.roomtoken = notificationPayload.roomtoken;
        config.roomtokenexpirytime = notificationPayload.roomtokenexpirytime;
        config.traceId = notificationPayload.traceId;

        if (!config.rtcServer) {
            config.rtcServer = notificationPayload.rtcserver;
        }

        config.sessionType = "join";

        self.sendEvent("SDK_JoinSession", { "notificationPayload": notificationPayload });

        self.localStream = stream;
        self.create(config, connection);
    }
}

/**
 * This API is called to create a new Iris Rtc session or to join a incoming call. 
 * In case of anonymous call client application should pass having local media tracks for creating/joining a session.
 * In case of non-anonymous call client application should pass <code>config</code>, <code>connection</code>.
 * For incoming calls client should pass notification information in <code>config</code> with the 
 * required parameters to join session.
 * 
 * @param {json} config - Session config params requied to create a chat session
 * @param {object} connection - Rtc connection object
 * @public
 */
IrisRtcSession.prototype.createChatSession = function(sessionConfig, connection) {
    var self = this;
    var config = JSON.parse(JSON.stringify(sessionConfig));

    logger.log(logger.level.INFO, "IrisRtcSession",
        " Create chat session with config " + JSON.stringify(config));

    if (!config || config.type != "chat") {
        logger.log(logger.level.ERROR, "IrisRtcSession",
            " Invalid config or config.type, config.type should be chat ");
    } else if (!connection) {
        logger.log(logger.level.ERROR, "IrisRtcSession",
            " Invalid rtc connection !! ");
    } else if (!config.roomId || config.type != "chat") {
        logger.log(logger.level.ERROR, "IrisRtcSession",
            " Check the missing parameters " + JSON.stringify(config));
    } else if (!config.irisToken) {
        logger.log(logger.level.ERROR, "IrisRtcSession",
            " config.irisToken parameter is missing");
        return;
    } else {
        config.sessionType = "create";

        self.sendEvent("SDK_CreateChatSession", { roomId: config.roomId, routingId: config.routingId, traceId: config.traceId, type: config.type });

        self.create(config, connection);
    }
};

/**
 * This API is called to join a Iris Rtc session incase of  non-anonymous chat call.
 * For incoming calls client should pass notification information having required parameters to join session.<br/>
 * notification payload sent to this API must have <code>roomid</code>, <code>roomtoken</code> and <code>roomtokenexpirytime</code>.
 * @param {json} config - A json object having all parameters required to create a room
 * @param {object} connection - IrisRtcConnection object
 * @param {json} notificationPayload - Notification payload having roomid, roomtoken and roomtokenexpirytime
 * @public
 */
IrisRtcSession.prototype.joinChatSession = function(sessionConfig, connection, notificationPayload) {
    var self = this;
    var config = JSON.parse(JSON.stringify(sessionConfig));

    logger.log(logger.level.INFO, "IrisRtcSession",
        " Join chat session with config " + JSON.stringify(config));

    if (!config || config.type != "chat") {
        logger.log(logger.level.ERROR, "IrisRtcSession",
            " Invalid config or config.type, config.type should be chat ");
    } else if (!notificationPayload) {
        logger.log(logger.level.ERROR, "IrisRtcSession",
            " Invalid notificationPayload!! ");
    } else if (!connection) {
        logger.log(logger.level.ERROR, "IrisRtcSession",
            " Invalid rtc connection !! ");
    }
    // else if (!notificationPayload.roomId || !notificationPayload.roomtoken || !notificationPayload.roomtokenexpirytime) {
    //     logger.log(logger.level.ERROR, "IrisRtcSession",
    //         " RoomId, roomtoken and roomtokenexpirytime parameters are required");
    // } 
    else {
        config.roomId = notificationPayload.roomId;
        config.roomtoken = notificationPayload.roomtoken;
        config.roomtokenexpirytime = notificationPayload.roomtokenexpirytime;
        config.traceId = notificationPayload.traceId;
        config.sessionType = "join";

        if (!config.rtcServer) {
            config.rtcServer = notificationPayload.rtcserver;
        }

        self.sendEvent("SDK_JoinChatSession", { "notificationPayload": notificationPayload });

        self.create(config, connection);
    }
};

/**
 * Downgrade existing video/audio session to chat session
 * @param {json} downgradeConfig - user config for downgrading a session to chat
 * @param {json} notificationPayload - notification data for joining a chat session
 * @public 
 */
IrisRtcSession.prototype.downgradeToChat = function(downgradeConfig, notificationPayload) {
    try {
        var downgradeConfig = JSON.parse(JSON.stringify(downgradeConfig));

        logger.log(logger.level.INFO, "IrisRtcSession", "downgradeToChat :: Moving Audio/Video session to Chat session");
        logger.log(logger.level.INFO, "IrisRtcSession", "downgradeToChat : config : " + JSON.stringify(downgradeConfig));

        if (this.peerconnection) {
            this.peerconnection.close();
            this.peerconnection = null;
            this.localStream = null;
        }
        if (this.connection && this.connection.xmpp && this.config) {
            this.config.type = "chat";
            this.state = IrisRtcSession.INCOMING;
            this.connection.xmpp.stopPresenceAlive(this.config.roomId);
            this.updateEventType();

            if (downgradeConfig.sessionType == "create") {
                logger.log(logger.level.INFO, "IrisRtcSession", "downgradeToChat : Sending deallocate for create");
                this.sendEvent("SDK_DowngradeToChat", { "userData": this.config.userData });

                this.config.sessionType = "downgrade";
                this.connection.xmpp.sendAllocate(this.config);
            } else if (downgradeConfig.sessionType == "join") {
                logger.log(logger.level.INFO, "IrisRtcSession", "downgradeToChat : Sending deallocate for join");
                this.sendEvent("SDK_DowngradeToChat", { "notificationPayload": notificationPayload });

                this.config.sessionType = "downgrade";
                this.connection.xmpp.sendAllocate(this.config);
            } else {
                logger.log(logger.level.INFO, "IrisRtcSession", "downgradeToChat : Sending allocate for default");
                this.config.sessionType = "downgrade";
                this.connection.xmpp.sendAllocate(this.config);
                this.sendEvent("SDK_DowngradeToChat", { message: "Anonymous call" });
            }
        } else {
            logger.log(logger.level.ERROR, "IrisRtcSession", "downgradeToChat :: Connection or config is missing ");
        }
    } catch (error) {
        logger.log(logger.level.ERROR, "IrisRtcSession", "downgradeToChat :: Failed")
    }
}

/**
 * Move to a video session from chat session
 * @param {object} stream = Local media stream
 * @param {json} upgradeConfig - user config for upgrading to a video session
 * @param {json} notificationPayload - notification data for joining a chat session * 
 * @public
 */
IrisRtcSession.prototype.upgradeToVideo = function(stream, upgradeConfig, notificationPayload) {
    try {
        var upgradeConfig = JSON.parse(JSON.stringify(upgradeConfig));

        logger.log(logger.level.INFO, "IrisRtcSession", "upgradeToVideo :: Moving form Chat session to Video session");
        logger.log(logger.level.INFO, "IrisRtcSession", "upgradeToVideo :: config : " + JSON.stringify(upgradeConfig));

        if (!stream) {
            logger.log(logger.level.ERROR, "IrisRtcSession", "upgradeToVideo :: stream is missing, Can't upgrade to video call ");
            return;
        }

        this.localStream = stream;

        if (this.connection && this.connection.xmpp && this.config) {
            this.config.type = "video";
            this.state = IrisRtcSession.INCOMING;
            this.connection.xmpp.stopPresenceAlive(this.config.roomId);
            this.updateEventType();
            this.initWebRTC(this.connection.iceServerJson, this.config.type);
            this.addStream(this.localStream);

            if (upgradeConfig.sessionType == "create") {

                logger.log(logger.level.INFO, "IrisRtcSession", "upgradeToVideo :: Sending root event");

                this.config.sessionType = "upgrade";
                this.config.userData = upgradeConfig.userData ? upgradeConfig.userData : this.config.userData;

                logger.log(logger.level.INFO, "IrisRtcSession", "upgradeToVideo :: Config : " + JSON.stringify(this.config));
                this.sendEvent("SDK_UpgradeToVideo", { "userData": this.config.userData });
                this.sendEvent("SDK_RootEventRequest", { "userData": this.config.userData });

                this.sendRootEventWithRoomId(this.config);

            } else if (upgradeConfig.sessionType == "join" && notificationPayload) {

                logger.log(logger.level.INFO, "IrisRtcSession", "upgradeToVideo :: Sending allocate for join");
                this.sendEvent("SDK_UpgradeToVideo", { "notificationPayload": notificationPayload });
                this.config.sessionType = "upgrade";
                this.config.roomId = notificationPayload.roomId;
                this.config.roomtoken = notificationPayload.roomtoken;
                this.config.roomtokenexpirytime = notificationPayload.roomtokenexpirytime;
                this.config.traceId = notificationPayload.traceId;
                this.connection.xmpp.sendAllocate(this.config);
            } else {
                logger.log(logger.level.INFO, "IrisRtcSession", "upgradeToVideo :: Sending allocate for anonymous call");
                this.config.sessionType = "upgrade";
                this.connection.xmpp.sendAllocate(this.config);
                this.sendEvent("SDK_UpgradeToVideo", { message: "Anonymous call" });
            }
        } else {
            logger.log(logger.level.ERROR, "IrisRtcSession", "upgradeToVideo :: Failed, check for connection and config");
        }
    } catch (error) {
        logger.log(logger.level.ERROR, "IrisRtcSession", "upgradeToVideo :: Failed ", error)
    }
}

/**
 * Move to a audio session from chat session
 * @param {object} stream = Local media stream - audio
 * @public
 */
IrisRtcSession.prototype.upgradeToAudio = function(stream, upgradeConfig, notificationPayload) {
    try {
        var upgradeConfig = JSON.parse(JSON.stringify(upgradeConfig));

        logger.log(logger.level.INFO, "IrisRtcSession", "upgradeToAudio :: Moving form Chat session to Audio session");

        if (!stream) {
            logger.log(logger.level.ERROR, "IrisRtcSession", "upgradeToAudio :: stream is missing, Can't upgrade to audio call ");
            return;
        }
        this.localStream = stream;

        if (this.connection && this.connection.xmpp && this.config) {
            this.config.type = "audio";
            this.state = IrisRtcSession.INCOMING;
            this.connection.xmpp.stopPresenceAlive(this.config.roomId);
            this.updateEventType();
            this.initWebRTC(this.connection.iceServerJson, this.config.type);
            this.addStream(this.localStream);

            if (upgradeConfig.sessionType == "create") {

                logger.log(logger.level.INFO, "IrisRtcSession", "upgradeToAudio : Sending root event");
                this.config.sessionType = "upgrade";
                this.config.userData = upgradeConfig.userData ? upgradeConfig.userData : this.config.userData;
                logger.log(logger.level.INFO, "IrisRtcSession", "upgradeToAudio : Config :: " + JSON.stringify(this.config));
                this.sendEvent("SDK_UpgradeToAudio", { "userData": this.config.userData });
                this.sendEvent("SDK_RootEventRequest", { "userData": this.config.userData });
                this.sendRootEventWithRoomId(this.config);

            } else if (upgradeConfig.sessionType == "join" && notificationPayload) {

                logger.log(logger.level.INFO, "IrisRtcSession", "upgradeToAudio : Sending allocate for join");
                this.config.sessionType = "upgrade";
                this.config.roomId = notificationPayload.roomId;
                this.config.roomtoken = notificationPayload.roomtoken;
                this.config.roomtokenexpirytime = notificationPayload.roomtokenexpirytime;
                this.config.traceId = notificationPayload.traceId;
                this.sendEvent("SDK_UpgradeToAudio", JSON.stringify({ "notificationPayload": notificationPayload }));
                this.connection.xmpp.sendAllocate(this.config);
            } else {
                logger.log(logger.level.INFO, "IrisRtcSession", "upgradeToAudio : Sending allocate for anonymous case");
                this.config.sessionType = "upgrade";
                this.sendEvent("SDK_UpgradeToAudio", { message: "Anonymous call" });
                this.connection.xmpp.sendAllocate(this.config);
            }
        } else {
            logger.log(logger.level.ERROR, "IrisRtcSession", "upgradeToAudio :: Failed, check for connection and config");
        }
    } catch (error) {
        logger.log(logger.level.ERROR, "IrisRtcSession", "upgradeToAudio :: Failed ", error)
    }
}


/**
 * This API gets real time media stats
 * @param {string} roomId - Unique Id for participants in a room
 * @public
 */
IrisRtcSession.prototype.getRealTimeStats = function(roomId) {
    try {
        if (this && this.sdkStats && this.peerconnection) {

            if (roomId != this.config.roomId)
                return;

            var realtimestats = this.sdkStats.getPeerStats(this.peerconnection, rtcConfig.json.statsInterval, false);
            return realtimestats;
        } else {
            logger.log(logger.level.ERROR, "IrisRtcSession", "getRealTimeStats :: Failed : Check for RtcStats and peerconnection initialization");
        }
    } catch (error) {
        logger.log(logger.level.ERROR, "IrisRtcSession", "getRealTimeStats :: Failed", error);
    }
};

/**
 * Update eventType based on type of the call
 * @private
 */
IrisRtcSession.prototype.updateEventType = function() {
    try {
        if (this && this.config && this.config.type) {
            switch (this.config.type) {
                case "video":
                    this.config.eventType = "videocall";
                    break;
                case "audio":
                    this.config.eventType = "audiocall";
                    break;
                case "pstn":
                    this.config.eventType = "pstncall";
                    break;
                case "chat":
                    this.config.eventType = "groupchat";
                    break;
                default:
                    //
            }
        }
        logger.log(logger.level.INFO, "IrisRtcSession", "updateEventType :: eventType : " + this.config.eventType);
    } catch (error) {
        logger.log(logger.level.ERROR, "IrisRtcSession", "updateEventType :: Failed", error);
    }
}

/**
 * Callback for succeffully created session
 * @param {string} roomId - roomId created
 * @public
 */
IrisRtcSession.prototype.onSessionCreated = function(roomId) {

}

/**
 * onSessionJoined is called when caller joins session.
 * @param {string} roomId - RoomId to which user has joined 
 * @param {string} myJid - Jid of the caller
 * @public
 */
IrisRtcSession.prototype.onSessionJoined = function(roomId, myJid) {

};

/**
 * Callback to inform session is connected successfully
 * @param {string} roomId - Room Id
 * @public
 */
IrisRtcSession.prototype.onSessionConnected = function(roomId) {

};

/**
 * Callback to inform remote participant joined successfully
 * @param {string} roomId - Room name of the participant joined
 * @param {string} participantJid - Unique Jid of the remote participant
 * @public
 */
IrisRtcSession.prototype.onSessionParticipantJoined = function(roomId, participantJid) {

};

/**
 * Callback to inform remote participant has left the session
 * @param {string} roomId - Room name of the participant joined
 * @param {string} participantJid - Unique Jid of the remote participant
 * @param {boolean} closeSession - Boolean value to close the session if all remote participants leave room
 * @public
 */
IrisRtcSession.prototype.onSessionParticipantLeft = function(roomId, participantJid, closeSession) {

};

/**
 * Callback for notifying client of about a not responding participant in the room
 * @param {string} roomId - Room id
 * @param {string} participantJid - Unique Jid of the remote participant
 * @public
 */
IrisRtcSession.prototype.onSessionParticipantNotResponding = function(roomId, participantJid) {
    //
};


/**
 * Callback to inform about the session relarted errors
 * @param {string} roomId - Room ID
 * @param {object} error - Error details from session
 * @public
 */
IrisRtcSession.prototype.onError = function(roomId, error) {

};

/**
 * Callback to inform the session id for the session ended
 * @param {string} roomId - Room Id unique to participants
 * @public
 */
IrisRtcSession.prototype.onSessionEnd = function(roomId) {

};

/**
 * API to receive the chat messages from other participants
 * @param {string} roomId - Unique to participants 
 * @param {json} chatMsgJson - Chat message json from the other participant 
 * @param {string} chatMsgJson.message - Chat message from participant
 * @param {string} chatMsgJson.from - Remote participant's unique id
 * @param {string} chatMsgJson.roomId - Unique to participants
 * @param {UUIDv1} chatMsgJson.rootNodeId - Root node id for the message
 * @param {UUIDv1} chatMsgJson.childNodeId - Child node id for the meesage
 * @public
 */
IrisRtcSession.prototype.onChatMessage = function(roomId, chatMsgJson) {

};

/**
 * Acknowledgement API for chat messages sent
 * @param {string} roomId - Unique to participants
 * @param {json} chatAckJson - Unique id for the each chat message sent
 * @param {string} chatAckJson.statusCode - Status code for sent message
 * @param {string} chatAckJson.statusMessage - Status message for the message sent
 * @param {string} chatAckJson.id -  Unique Id of the message sent
 * @param {string} chatAckJson.roomId -  Room id
 * @param {string} chatAckJson.rootNodeId - Root node id for the message - If message is sent
 * @param {string} chatAckJson.childNodeId - Child node id for the meesage - If message is sent
 * @public
 */
IrisRtcSession.prototype.onChatAck = function(roomId, chatAckJson) {

};

/**
 * This event is called when dominant speaker changes in conference
 * @param {string} roomId - Unique to participants in room
 * @param {string} dominantSpeakerId - Dominant speaker's id
 * @public
 */
IrisRtcSession.prototype.onDominantSpeakerChanged = function(roomId, dominantSpeakerId) {

};


/**
 * This is called when a participant changes type of the call
 * ex. From char > video or video > chat, callType will be 
 * "video" for a video call
 * "audio" for a audio call
 * "chat" for a chat session
 * @param {string} roomId - Unique to participants in the room
 * @param {string} participantJid - Jid of the participant whose session type has changed
 * @param {string} type - Session type changed to ex. video, chat 
 * @public
 */
IrisRtcSession.prototype.onSessionTypeChange = function(roomId, participantJid, type) {

}


/**
 * @private
 */
IrisRtcSession.prototype.lastNChanged = function(oldValue, newValue) {

};

/**
 * @private
 */
IrisRtcSession.prototype.lastNEndPointChanged = function(lastNEndpoints, endpointsEnteringLastN, obj) {

};

/**
 * When a text message is received through datachannel
 * @private 
 */
IrisRtcSession.prototype.onDataChannelMessage = function(colibriClass, obj) {

};

/**
 * API to end the session 
 * @param roomId - Room ID
 * @public
 */
IrisRtcSession.prototype.endSession = function(roomId) {

    logger.log(logger.level.INFO, "IrisRtcSession",
        "endSession :: roomId " + roomId + " ", this);

    if (this.config && this.config.roomId !== roomId) {
        logger.log(logger.level.ERROR, "IrisRtcSession",
            "endSession called with wrong roomId " + roomId);
        return;
    }
    this.end();
};

/**
 * API to get the timebased uuid
 * @private
 */
IrisRtcSession.getUUIDV1 = function() {
    return uuidV1();
};

/**
 * API to get the timebased uuid
 * @private
 */
IrisRtcSession.prototype.getUUIDV1 = IrisRtcSession.getUUIDV1;