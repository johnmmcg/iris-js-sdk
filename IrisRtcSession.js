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
var RtcEvents = require("./modules/RtcEvents.js");
var SDP = require('./modules/Utils/SDP.js');
var SDPUtil = require("./modules/Utils/SDPUtil.js");
var SDPDiffer = require('./modules/Utils/SDPDiffer.js');
var RtcBrowserType = require("./modules/Utils/RtcBrowserType.js");
var SDPMangler = require('./modules/Utils/SDPMangler.js');

// var WebRTC      = require('./modules/node-webrtc/webrtc.node');
var WebRTC = require('./modules/RtcWebrtcAdapter.js');

//Enable/disable webrtc.node debug mode
setWebRTCDebug(rtcConfig.json.webrtcLogs);

// List to store reference of session as callbacks are not invoked
// in the context of session
var sessionsList = [];
var sessionConfig = null;

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
    this.traceId = '';
    this.sessionId = sid();
    this.state = IrisRtcSession.NONE;
    this.config = null;
    this.connection = null;
    this.emRoomId = null;
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
    this.remoteStreams = {};
    this.dataChannels = [];
    this.dataChannel = null;
    this.isStreamMuted = false;
    this.isVideoMuted = false;
    this.isAudioMuted = false;
    // Add the entry
    sessionsList[this.sessionId] = this;
    this.interop = new Interop();
    // Stats Init
    this.sdkStats = new rtcStats(this.config);

    this.addSourcesQueue = async.queue(this.addSourceFF.bind(this), 1);
    this.addSourcesQueue.pause();
}

/**
 * Entry point for creating the session
 * @param {json} config - type, routingId, anonymous, roomName
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
    if (!this.config.traceId || this.config.traceId == "")
        this.config.traceId = this.getUUIDV1();

    this.config.sessionId = this.sessionId;
    this.config.presenceType = "join";
    if (!self.localStream) {
        this.config.audiomuted = "true";
        this.config.videomuted = "true";
    } else {
        this.config.audiomuted = "false";
        this.config.videomuted = "false";
    }

    logger.log(logger.level.INFO, "IrisRtcSession",
        " Join session " + JSON.stringify(config));

    if (this.config.type != "chat") {
        // Init webrtc
        // Create peerconnection now
        self.initWebRTC(connection.iceServerJson, this.config.type);

        // Add stream to peer connection
        self.addStream(self.localStream);
    }

    // Dont send create room for join room call
    if (config.sessionType != "join") {
        sessionConfig = this.config;

        connection.xmpp.sendCreateRootEventWithRoomId(sessionConfig);
    } else {
        // Send the presence directly
        // Get the EM room id
        self.emRoomId = config.roomId;
        self.config.rootNodeId = "00000"; //TBD
        self.config.childNodeId = "00000";
        self.config.emRoomId = config.roomId;

        //PSTN caller info details
        if ((self.config.type == "pstn") && config.userinfo) {
            self.sendEvent(this.sessionId, "SDK_IncomingCall_UserInfo", config.userinfo);
        }

        // Set the state to CONNECTING
        self.state = IrisRtcSession.CONNECTING;

        sessionConfig = self.config;
        if ((rtcConfig.json.useBridge || (self.config.type == "pstn")) && self.config.type != "chat") {
            if (rtcConfig.json.channelLastN)
                sessionConfig.channelLastN = rtcConfig.json.channelLastN;

            // Send the allocate room request
            connection.xmpp.sendAllocate(sessionConfig);
        } else {
            // Send the presence if room is created
            connection.xmpp.sendPresence(sessionConfig);
        }
    }

    // Setup callbacks for create root event success
    connection.xmpp.once(RtcEvents.CREATE_ROOT_EVENT_SUCCESS, function(response) {
        // connection.xmpp.once('onCreateRootEventWithRoomIdSent', function(response) {
        logger.log(logger.level.VERBOSE, "IrisRtcSession",
            " onCreateRootEventWithRoomIdSent " + JSON.stringify(response));

        if (self.state == IrisRtcSession.CONNECTING) return;

        // Get the EM room id
        self.emRoomId = response.eventdata.room_id;
        self.config.rootNodeId = response.root_node_id;
        self.config.childNodeId = response.child_node_id;
        self.config.emRoomId = response.eventdata.room_id;
        self.config.roomtoken = response.eventdata.room_token;
        self.config.roomtokenexpirytime = response.eventdata.room_token_expiry_time;

        if (rtcConfig.json.rtcServer) {
            self.config.rtcServer = rtcConfig.json.rtcServer;
            self.connection.xmpp.rtcServer = rtcConfig.json.rtcServer;
        } else {
            self.config.rtcServer = response.rtc_server;
        }
        // Set the state to CONNECTING
        self.state = IrisRtcSession.CONNECTING;

        if (rtcConfig.json.useBridge || (self.config.type == "pstn")) {
            if (rtcConfig.json.channelLastN)
                sessionConfig.channelLastN = rtcConfig.json.channelLastN;
            // Send the allocate room request
            connection.xmpp.sendAllocate(sessionConfig);
        } else {
            // Send the presence if room is created
            connection.xmpp.sendPresence(sessionConfig);

            if (!rtcConfig.json.useBridge)
                connection.xmpp.sendPresenceAlive(sessionConfig);

        }

        self.onCreated(response.eventdata.room_id);

        // Send events
        self.sendEvent(self.sessionId, "SDK_EventManagerResponse", JSON.stringify(response));

    });

    // Setup callbacks for create root event error
    connection.xmpp.once('onCreateRootEventWithRoomIdError', function(error) {
        logger.log(logger.level.VERBOSE, "IrisRtcSession",
            " onCreateRootEventWithRoomIdError ", error);
        self.onError(error);
    });

    // Setup callbacks for IQ errors
    connection.xmpp.on('onIQError', function(error) {
        logger.log(logger.level.VERBOSE, "IrisRtcSession",
            " onIQError ", error);
    });
    // Setup callbacks for createroom event error
    connection.xmpp.removeAllListeners(["onAllocateSuccess"]);
    connection.xmpp.on('onAllocateSuccess', function(data) {
        logger.log(logger.level.VERBOSE, "IrisRtcSession",
            " onAllocateSuccess " + data.focusJid);

        self.focusJid = data.focusJid;

        // Send the presence if room is created
        connection.xmpp.sendPresence(sessionConfig);

        // Send presence Alive
        connection.xmpp.sendPresenceAlive(sessionConfig);
    });
    // Setup callbacks for Presence for self and other participants 
    connection.xmpp.on('onCapabilityRequest', function(response) {
        logger.log(logger.level.VERBOSE, "IrisRtcSession",
            " Received capability request"
        );
        // Send the capability
        var data = {
            "to": response.from,
            "id": response.id,
            "rootNodeId": self.config.rootNodeId,
            "childNodeId": self.config.childNodeId,
            "traceid": this.traceId,
            "emRoomId": self.config.emRoomId
        };
        // Call the session-initiate api
        connection.xmpp.sendCapabilities(data);
    });
    // Setup callbacks for Presence for self and other participants 
    connection.xmpp.on('onPresence', function(response) {
        /*logger.log(logger.level.VERBOSE, "IrisRtcSession", 
              " onPresence " + JSON.stringify(response)
              + " config " + JSON.stringify(self.config) 
              + " state " + self.state
              );*/

        var found = false;

        // Get the pointer using the sessionId
        /* sessionsList.forEach(function (key, value)
         {
           if (key.config.emRoomId == response.roomName)
           {
             self = key;
             found = true;
           }
         });

         // Not found
         if (!found) return;*/

        if (!self.connection) return;

        if ((response.jid == self.connection.myJid) &&
            (response.roomName == self.config.emRoomId)) {
            if (response.type == "join") {
                if (self.presenceState == IrisRtcSession.PRESENCE_JOINED) {
                    // This is just an update so ignore

                    // Check if we have become moderator
                    if (response.role == "moderator" && self.config.focusJid) {
                        // for audio call, send the rayo command
                        /*if (self.config.type == "audio" && self.pstnState ==IrisRtcSession.NONE)
                        {
                            self.pstnState = IrisRtcSession.INPROGRESS;
                            // send the rayo command
                            connection.xmpp.sendRayo(self.config);
                        }*/
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
                self.onJoined(response.roomName, self.sessionId, response.jid);
                self.presenceState = IrisRtcSession.PRESENCE_JOINED;

                logger.log(logger.level.INFO, "IrisRtcSession",
                    " onPresence " + JSON.stringify(response));


                // Send events
                self.sendEvent(self.sessionId, "SDK_XMPPJoined", response.roomName);

                // for audio call, send the rayo command
                if (self.config.type == "pstn" && self.config.sessionType != "join" && self.pstnState == IrisRtcSession.NONE) {
                    self.pstnState = IrisRtcSession.INPROGRESS;
                    // send the rayo command
                    connection.xmpp.sendRayo(self.config);
                }

                /* Stats Init Begin*/
                var statsOptions = {
                    XMPPServer: connection.xmppServer,
                    roomId: self.config.emRoomId,
                    routingId: self.config.routingId,
                    traceId: self.config.traceId,
                    serviceId: self.sessionId,
                    UEStatsServer: rtcConfig.json.urls.UEStatsServer,
                    sdkVersion: rtcConfig.json.sdkVersion,
                    UID: self.connection.publicId
                };

                self.sdkStats.options = statsOptions;
                self.sdkStats.getPeerStats(self.peerconnection, rtcConfig.json.statsInterval);
                /* Stats Init End*/

                // Check the state
                if (self.state == IrisRtcSession.CONNECTING) {
                    logger.log(logger.level.ERROR, "IrisRtcSession",
                        " send onCreated ");

                    // We were the first ones to join so go with createoffer flow
                    // Only for non bridge case we generate the offer first
                    if (!rtcConfig.json.useBridge && (self.config.sessionType != "join") && (self.config.type != "pstn")) {
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
                // Get the pointer using the sessionId
                /*var found = false;

                sessionsList.forEach(function (key, value)
                {
                  if (key.config.emRoomId == response.roomName)
                  {
                    self = key;
                    found = true;
                  }
                });
                if (!found) return;*/

                Object.keys(self.participants).forEach(function(jid) {
                    if (jid == response.jid) {
                        delete self.participants[jid];
                    }

                });

                var closeSession = false;
                if (self.participants && Object.keys(self.participants).length == 0) {
                    closeSession = true; // Close session if all participants left
                }

                self.onParticipantLeft(response.roomName, self.sessionId, response.jid, closeSession);
                // Send events
                self.sendEvent(self.sessionId, "SDK_XMPPOccupantLeft", response.jid);
            }
        } else if (response.roomName == self.config.emRoomId) {
            if (response.type == "join") {
                found = false;
                Object.keys(self.participants).forEach(function(jid) {
                    if (jid == response.jid) {
                        found = true;
                    }

                });

                if (!found) {
                    if (response.jid.indexOf('f0cus') > 0) {
                        // Change the focus jid
                        self.config.focusJid = response.jid;

                        logger.log(logger.level.INFO, "IrisRtcSession",
                            " onPresence " + JSON.stringify(response));

                        // Send events
                        self.sendEvent(self.sessionId, "SDK_XMPPFocusJoined", response.jid);

                        // Set the state to INCOMING
                        self.state = IrisRtcSession.INCOMING;

                        // Send the capability
                        var data = {
                            "to": response.from,
                            "rootNodeId": self.config.rootNodeId,
                            "childNodeId": self.config.childNodeId,
                            "traceid": this.traceId,
                            "emRoomId": self.config.emRoomId
                        };
                        self.connection.xmpp.requestCapabilities(data);
                    } else {
                        self.jid = response.jid;
                        self.participants[response.jid] = { "jid": response.jid };
                        self.onParticipantJoined(response.roomName, self.sessionId, response.jid);

                        logger.log(logger.level.INFO, "IrisRtcSession",
                            " onPresence " + JSON.stringify(response));

                        // Send events
                        self.sendEvent(self.sessionId, "SDK_XMPPOccupantJoined", response.jid);

                        // Send the capability
                        var data = {
                            "to": response.from,
                            "rootNodeId": self.config.rootNodeId,
                            "childNodeId": self.config.childNodeId,
                            "traceid": this.traceId,
                            "emRoomId": self.config.emRoomId
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
                            "rootNodeId": self.config.rootNodeId,
                            "childNodeId": self.config.childNodeId,
                            "traceid": this.traceId,
                            "emRoomId": self.config.emRoomId
                        };
                        // Call the session-initiate api
                        self.connection.xmpp.sendSessionInitiate(data);
                        // Send events
                        self.sendEvent(self.sessionId, "SDK_XMPPJingleSessionInitiateSent", "");

                    }
                }
            } else if (response.type == "unavailable") {
                // Get the pointer using the sessionId
                /*var found = false;

                sessionsList.forEach(function (key, value)
                {
                  if (key.config.emRoomId == response.roomName)
                  {
                    self = key;
                    found = true;
                  }
                });
                if (!found) return;*/


                Object.keys(self.participants).forEach(function(jid) {
                    if (jid == response.jid) {
                        delete self.participants[jid];
                    }

                });
                var closeSession = false;
                if (self.participants && Object.keys(self.participants).length == 0) {
                    closeSession = true; // Close session if all participants left
                }

                self.onParticipantLeft(response.roomName, self.sessionId, response.jid, closeSession);
                // Send events
                self.sendEvent(self.sessionId, "SDK_XMPPOccupantLeft", response.jid);
            }
        }
    });

    // Setup callbacks for Presence error 
    connection.xmpp.on('onPresenceError', function(error) {
        logger.log(logger.level.VERBOSE, "IrisRtcSession",
            " onPresenceError " + error);
        self.onError(error);
    });
    // Setup callbacks for session initiate 
    connection.xmpp.on('onCandidate', function(data) {

        /* var found = false;
         // Get the pointer using the sessionId
         sessionsList.forEach(function (key, value)
         {
           if (key.config.emRoomId == data.roomName)
           {
             self = key;
             found = true;
           }
         });
         if (!found) return;*/

        logger.log(logger.level.VERBOSE, "IrisRtcSession",
            " onCandidate " + " roomName " + data.roomName +
            " with data " + JSON.stringify(data) +
            "config.emRoomId " + config.emRoomId);
        // Check if this is the correct session
        if (data.roomName != self.config.emRoomId) return;

        if (self.peerconnection != null) {
            try {
                // Create the candidate
                var candidate = new WebRTC.RTCIceCandidate({
                    "sdpMLineIndex": data.sdpMLineIndex,
                    "sdpMid": data.sdpMid,
                    "candidate": data.line
                });
                // Send events
                self.sendEvent(self.sessionId, "SDK_XMPPTransportInfoReceived", data.line);

                // Addice candidate
                self.peerconnection.addIceCandidate(candidate);
            } catch (e) {
                logger.log(logger.level.ERROR, "IrisRtcSession",
                    " error adding candidate  " + e);
            }
        }
    });

    // Setup callbacks for session initiate 
    connection.xmpp.removeAllListeners(["onSessionInitiate"]);
    connection.xmpp.on('onSessionInitiate', function(data) {

        /*var found = false;
        // Get the pointer using the sessionId
        sessionsList.forEach(function (key, value)
        {
          if (key.config.emRoomId == data.roomName)
          {
            self = key;
            found = true;
          }
        });
        if (!found) return;*/

        logger.log(logger.level.VERBOSE, "IrisRtcSession",
            " onSessionInitiate " + " roomName " + data.roomName + " config.emRoomId " + self.config.emRoomId);

        // Check if this is the correct session
        if (data.roomName != self.config.emRoomId) return;

        // Check if we were supposed to receive this
        if (self.state == IrisRtcSession.INCOMING) {
            if (self.peerconnection != null) {
                // Check the current state of peerconnection: TBD
                logger.log(logger.level.INFO, "IrisRtcSession",
                    " Calling setRemoteDescription with  " + data.sdp +
                    " peerconnection " + self.peerconnection.signalingState);
                var desc = new RTCSessionDescription({ "sdp": data.sdp, "type": "offer" });

                self.state = IrisRtcSession.INPROGRESS;
                self.to = data.from;
                self.setOffer(desc, data.from);
                self.readSsrcs(data);

                // Send events
                self.sendEvent(self.sessionId, "SDK_XMPPJingleSessionInitiateReceived", "");
            }
        } else {
            logger.log(logger.level.ERROR, "IrisRtcSession",
                " Ignoring session-initiate as state is " + self.state);
        }
    });

    // Setup callbacks for session initiate 
    connection.xmpp.removeAllListeners(["onSourceAdd"]);
    this.connection.xmpp.on('onSourceAdd', function(data) {

        logger.log(logger.level.VERBOSE, "IrisRtcSession",
            " onSourceAdd " + " roomName " + data.roomName + " config.emRoomId " + self.config.emRoomId);

        // Check if this is the correct session
        if (data.roomName != self.config.emRoomId) return;

        // Check if we were supposed to receive this
        {
            if (self.peerconnection != null) {
                // Check the current state of peerconnection: TBD
                logger.log(logger.level.INFO, "IrisRtcSession",
                    " Calling setRemoteDescription with  " + data.sdp +
                    " \npeerconnection " + self.peerconnection.signalingState);
                //var desc = new RTCSessionDescription({ "sdp": data.sdp, "type": "offer" });

                // self.setReOffer(data);
                // self.readSsrcs(data);


                if (RtcBrowserType.isFirefox()) {
                    logger.log(logger.level.VERBOSE, "IrisRtcSession", "addSourcesQueue :: Call addSourceFF");
                    // self.addSourceFF(data);

                    // self.dataNew = data;

                    // var localsdp_new = self.interop.toPlanB(self.peerconnection.localDescription);
                    // var old_sdp = new SDP(localsdp_new.sdp);

                    self.addSourcesQueue.push(data, function(old_sdp) {
                        logger.log(logger.level.VERBOSE, "IrisRtcSession", "addSourcesQueue Done");

                        logger.log(logger.level.VERBOSE, "IrisRtcSession", "addSourcesQueue Done old_sdp :" + old_sdp);

                        var localsdp_new = self.interop.toPlanB(self.peerconnection.localDescription);
                        var new_sdp = new SDP(localsdp_new.sdp);
                        var sdpDiffer = new SDPDiffer(old_sdp, new_sdp);
                        logger.log(logger.level.VERBOSE, "IrisRtcSession", "addSourcesQueue Done new_sdp : " + new_sdp);

                        var dataAdd = {
                            "to": self.to,
                            "rootNodeId": self.config.rootNodeId,
                            "childNodeId": self.config.childNodeId,
                            "traceid": self.traceId,
                        };
                        logger.log(logger.level.VERBOSE, "IrisRtcSession", "addSourcesQueue Done dataAdd : " + dataAdd);

                        self.connection.xmpp.sendSourceAdd(sdpDiffer, dataAdd);
                    });
                } else {

                    self.setReOffer(data);
                }
                self.readSsrcs(data);

                // if (RtcBrowserType.isChrome() || (RtcBrowserType.isFirefox() && self.participants.length >= 2)) {
                //     self.setReOffer(desc, data.from);
                //     self.readSsrcs(data);
                // } else {
                //     logger.log(logger.level.VERBOSE, "IrisRtcSession", "Not setting ReOffer");
                //     return;
                // }

                // Send events
                self.sendEvent(self.sessionId, "SDK_XMPPJingleSourceAddReceived", "");
            }
        }
    });

    this.connection.xmpp.on('onSourceRemove', function(data) {
        logger.log(logger.level.VERBOSE, "IrisRtcSession",
            " onSourceRemove " + " roomName " + data.roomName + " config.emRoomId " + self.config.emRoomId);

        // Check if this is the correct session
        if (data.roomName != self.config.emRoomId) return;

        // Check if we were supposed to receive this
        {
            if (self.peerconnection != null) {
                // Check the current state of peerconnection: TBD
                logger.log(logger.level.INFO, "IrisRtcSession", " Calling setRemoteDescription with  " + data.sdp +
                    " peerconnection " + self.peerconnection.signalingState);

                var remoteDesc = new SDP(self.peerconnection.remoteDescription.sdp);

                var newRemoteDesc = SDPUtil.removeSources(data.jingle, remoteDesc);

                self.setReOfferForSourceRemove(newRemoteDesc);

                // Send events
                self.sendEvent(self.sessionId, "SDK_XMPPJingleSourceRemovedReceived", "");
            }
        }
    });

    // Setup callbacks for session initiate 
    this.connection.xmpp.on('onSessionAccept', function(data) {
        /*var found = false;

        // Get the pointer using the sessionId
        sessionsList.forEach(function (key, value)
        {
          if (key.config.emRoomId == data.roomName)
          {
            self = key;
            found = true;
          }
        });
        if (!found) return;*/
        logger.log(logger.level.VERBOSE, "IrisRtcSession",
            " onSessionAccept " + " roomName " + data.roomName + " config.emRoomId " + self.config.emRoomId);
        // Check if this is the correct session
        // if (data.roomName != config.emRoomId) return;

        // Check if we were supposed to receive this
        if (self.state == IrisRtcSession.OUTGOING) {
            // Send events
            self.sendEvent(self.sessionId, "SDK_XMPPJingleSessionAcceptReceived", "");

            if (self.peerconnection != null) {
                // Check the current state of peerconnection: TBD
                logger.log(logger.level.INFO, "IrisRtcSession",
                    " Calling setRemoteDescription with  " + data.sdp +
                    " peerconnection " + self.peerconnection.signalingState);
                var desc = new RTCSessionDescription({ "sdp": data.sdp, "type": "answer" });

                self.state = IrisRtcSession.INPROGRESS;
                self.to = data.from;
                self.setAnswer(desc, data.from);

                // send the candidates
                process.nextTick(function() {
                    // send the candidates
                    self.sendCandidates();
                });
            }
        } else {
            logger.log(logger.level.ERROR, "IrisRtcSession",
                " Ignoring session-initiate as state is " + self.state);
        }
    });

    // Event listener for mute or unmute events
    // mute - true - Mute the local video
    // mute - false - Unmute the local video
    this.connection.xmpp.on('onVideoMute', function(mute) {
        logger.log(logger.level.INFO, "IrisRtcSession",
            " onVideoMute " + " mute " + mute);
        if (self.localStream) {
            if ((mute && !self.isVideoMuted) || (!mute && self.isVideoMuted)) {
                self.videoMuteToggle();
            }
        }
    });

    // Event listener for mute or unmute events
    // mute - true - Mute the local audio
    // mute - false - Unmute the local audio
    this.connection.xmpp.on('onAudioMute', function(mute) {
        logger.log(logger.level.INFO, "IrisRtcSession",
            " onAudioMute " + " mute " + mute);
        if (self.localStream) {
            if ((mute && !self.isAudioMuted) || (!mute && self.isAudioMuted)) {
                self.audioMuteToggle();
            }
        }
    });

    // Event listener for group chat messages
    this.connection.xmpp.on('onGroupChatMessage', function(chatMsgJson) {
        logger.log(logger.level.INFO, "IrisRtcSession",
            " onGroupChatMessage " + " message " + JSON.stringify(chatMsgJson));

        self.onChatMessage(chatMsgJson);

    });

    // Event listener for chat ack messages
    this.connection.xmpp.on('onChatAck', function(chatAckJson) {
        logger.log(logger.level.INFO, "IrisRtcSession",
            " onChatAck " + " id " + chatAckJson.id + "Status " + chatAckJson.status);
        self.onChatAck(chatAckJson);
    });
};

/**
 * Mute remote participant's video
 * @param {string} jid - Remote participant's id
 * @param {boolean} mute - true -> mute, false -> unmute
 */
IrisRtcSession.prototype.muteParticipantVideo = function(jid, mute) {
    try {
        this.connection.xmpp.sendVideoMute(jid, mute);
    } catch (error) {
        logger.log(logger.level.ERROR, "IrisRtcSession", "muteParticipantVideo error ", error);
    }
};

/**
 * Mute remote participant's audio
 * @param {string} jid - Remote participant's id
 * @param {boolean} mute - true -> mute, false -> unmute
 */
IrisRtcSession.prototype.muteParticipantAudio = function(jid, mute) {
    try {
        this.connection.xmpp.sendAudioMute(jid, mute);
    } catch (error) {
        logger.log(logger.level.ERROR, "IrisRtcSession", "muteParticipantAudio error ", error);
    }
};

/**
 * This API is called to send a chat message.
 * @param {string} id - Unique Id for each message sent.
 * @param {string} message - Chat message to be sent
 */
IrisRtcSession.prototype.sendChatMessage = function(id, message) {

    if (!message || !id || (typeof id != 'string') || (typeof message != 'string')) {
        logger.log(logger.level.ERROR, "IrisRtcSession", "Message and id can't be empty : message :" +
            message + " id " + id);
        return;
    } else {
        logger.log(logger.level.INFO, "IrisRtcSession", "sendChatMessage :: message " + message);
        this.connection.xmpp.sendGroupChatMessage(this.config, id, message);
    }
};

/**
 * Entry point for ending the session
 * @private
 */
IrisRtcSession.prototype.end = function() {

    logger.log(logger.level.INFO, "IrisRtcSession", "end :: close the session");

    if (this.state != IrisRtcSession.NONE) {
        // Post stats to server
        this.sdkStats.submitStats();

        // Leave the room
        this.config.presenceType = "leave";
        //this.connection.xmpp.removeAllListeners("onIncoming");
        this.connection.xmpp.removeAllListeners(["onAllocateSuccess"]);

        // Send events
        this.sendEvent(this.sessionId, "SDK_SessionEnded", "");

        // Send the presence if room is created
        this.connection.xmpp.sendPresence(this.config);

        this.onSessionEnd(this.sessionId);

        // Set the presence state
        this.presenceState = IrisRtcSession.PRESENCE_NONE;

        // Set the pstn state
        this.pstnState = IrisRtcSession.NONE;

        this.connection.xmpp.rtcServer = null;

        // De-initialize
        this.traceId = null;
        this.sessionId = null;
        this.state = IrisRtcSession.NONE;
        //this.config = null;
        this.connection = null;
        this.emRoomId = null;
        this.participants = {};
        if (this.peerconnection)
            this.peerconnection.close();
        this.peerconnection = null;
        this.stream = null;
        this.localSdp = null;
        this.jid = null;
        this.candidates = [];
        this.to = null;
        this.focusJid = null;
        sessionConfig = null;
        this.dataChannels = [];
        this.dataChannel = null;
        this.isStreamMuted = false;

        // Add the entry
        //delete sessionsList[this];
        delete this; // Does this work?
    }
};

/**
 * Entry point for ending the old peerconnections
 * @private
 */
IrisRtcSession.prototype.peerconnection_end = function() {
    logger.log(logger.level.INFO, "IrisRtcSession",
        " closing old peer connections ");
    this.peerconnection.close();
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
            this.onRemoteStream(event.stream);
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

                logger.log(logger.level.VERBOSE, "IrisRtcSession",
                    "Remote stream is assigned with default participant Id : " + self.jid);

                event.stream.participantJid = self.jid;
            }
            if ((event.stream.id !== 'mixedmslabel') && (event.stream.label !== 'mixedmslabel')) {
                try {
                    logger.log(logger.level.INFO, "IrisRtcSession",
                        " Received stream :: ", event.stream);
                    if (event.stream.participantJid) {
                        if (!self.remoteStreams[event.stream.participantJid]) {
                            self.remoteStreams[event.stream.participantJid] = event.stream;
                        }
                    }

                    //Save stream to participant lists
                    self.participants[event.stream.participantJid].stream = event.stream;

                    logger.log(logger.level.INFO, "IrisRtcSession", " Sending stream to client ", event.stream);
                    this.onRemoteStream(event.stream);
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

    // Check the current state whether the remote participant has joined the room
    if ((Object.keys(this.participants).length != 0) && (this.localSdp || this.localAnswer)) {
        var self = this;
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
                "traceid": self.traceId,
                "rootNodeId": self.config.rootNodeId,
                "childNodeId": self.config.childNodeId
            };

            // Send the transport-info
            self.connection.xmpp.sendTransportInfo(data);

            self.sendEvent(self.sessionId, "SDK_XMPPJingleTransportInfoSent", candidate);
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
        if (self.config.useRelay && !event.candidate.candidate.includes('relay')) {
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
        if (this.peerconnection.iceConnectionState) {
            logger.log(logger.level.INFO, "IrisRtcSession",
                " onIceConnectionStateChange " + this.peerconnection.iceConnectionState);
            this.sendEvent(this.sessionId, "SDK_IceConnectionStateChange", this.peerconnection.iceConnectionState.toString());
            if (this.peerconnection.iceConnectionState.toString() == "connected") {
                this.onSessionConnected(this.sessionId);
            }
        } else if (this.peerconnection.iceState) {
            logger.log(logger.level.INFO, "IrisRtcSession",
                " onIceConnectionStateChange " + this.peerconnection.iceState);
            this.sendEvent(this.sessionId, "SDK_IceConnectionStateChange", this.peerconnection.iceState.toString());
            if (this.peerconnection.iceState.toString() == "connected") {
                this.onSessionConnected(this.sessionId);
            }
        } else {
            logger.log(logger.level.ERROR, "IrisRtcSession",
                " onIceConnectionStateChange :: Error in finding iceConnectionState");
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
        this.sendEvent(this.sessionId, "SDK_SignalingStateChange", this.peerconnection.signalingState.toString());
    }

};

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
                    self.onDominantSpeakerChanged(dominantSpeakerEndpoint);
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
 * @param participantId the identifier of the participant
 */
IrisRtcSession.prototype.selectParticipant = function(participantId) {
    try {
        if (this.dataChannel && participantId) {

            var jsonObject = {
                colibriClass: 'SelectedEndpointChangedEvent',
                selectedEndpoint: participantId || null
            };
            logger.log(logger.level.INFO, "IrisRtcSession", "selectParticipant :: Sending SelectedEndpointChangedEvent : " + JSON.stringify(jsonObject));
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
 * @param {string} participantId - Jid of the participant
 */
IrisRtcSession.prototype.pinParticipant = function(participantId) {

    try {
        if (this.dataChannel && participantId) {

            var jsonObject = {
                colibriClass: 'PinnedEndpointChangedEvent',
                pinnedEndpoint: participantId || null
            };

            logger.log(logger.level.INFO, "IrisRtcSession", "pinParticipant :: Sending PinnedEndpointChangedEvent : " + JSON.stringify(jsonObject));

            this.dataChannel.send(JSON.stringify(jsonObject));

        }
    } catch (error) {
        logger.log(logger.level.ERROR, "IrisRtcSession", "pinParticipant :: Failed to pin participant ", error);

    }
};

/**
 * Selects a new value for "lastN". The requested amount of videos are going
 * to be delivered after the value is in effect. Set to -1 for unlimited or
 * all available videos.
 * @param lastN the new number of videos the user would like to receive.
 */
IrisRtcSession.prototype.setLastN = function(value) {
    try {
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

        this.dataChannel.send(JSON.stringify(jsonObject));

    } catch (error) {
        logger.log(logger.level.ERROR, "IrisRtcSession", "Failed to set lastN", error);

    }
};

/**
 * Sends a message through data channel
 * @param {string} to - Participant jid
 * @param {string} msg - Message to be sent
 * @private
 */
IrisRtcSession.prototype.sendChannelMessage = function(to, msg) {
    try {
        if (this.dataChannel && to && msg) {
            var jsonObject = {
                colibriClass: 'EndpointMessage',
                msgPayload: msg,
                to: to
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

                        if (rtcConfig.json.useBridge && (urlArray[i].urls[j].includes('turn:') || urlArray[i].urls[j].includes('turns:')))
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
                    if (rtcConfig.json.useBridge && (urlArray[i].urls.includes('turn:') || urlArray[i].urls.includes('turns:')))
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

                if (rtcConfig.json.stream && rtcConfig.json.stream === 'sendonly') {
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

            if (rtcConfig.json.useIPv6) {
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
            this.onError(e);
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
        //nija
        // modSDP = modSDP.replace("a=sendrecv\r\n", "a=recvonly\r\n");
        // modSDP = modSDP.replace("a=sendrecv\r\n", "a=recvonly\r\n");

        desc.sdp = modSDP;

        logger.log(logger.level.VERBOSE, "IrisRtcSession",
            " Modified Offer \n" + desc.sdp);
    }

    if ((self.config.type == "video" || self.config.type == "audio") && rtcConfig.json.useBridge == true) {
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
                        "rootNodeId": self.config.rootNodeId,
                        "childNodeId": self.config.childNodeId,
                        "traceid": this.traceId,
                    };
                    // Send session-accept
                    self.connection.xmpp.sendSessionAccept(data);

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
                            "rootNodeId": self.config.rootNodeId,
                            "childNodeId": self.config.childNodeId,
                            "traceid": this.traceId,
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
                    answerDesc = self.interop.toPlanB(answerDesc);

                    self.localSdp = answerDesc.sdp;
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
                        //     "traceid": this.traceId,
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
                        "rootNodeId": self.config.rootNodeId,
                        "childNodeId": self.config.childNodeId,
                        "traceid": this.traceId,
                        "emRoomId": self.config.emRoomId
                    };
                    self.connection.xmpp.sendSourceAdd(sdpDiffer, data);

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
                        "rootNodeId": self.config.rootNodeId,
                        "childNodeId": self.config.childNodeId,
                        "traceid": this.traceId,
                        "emRoomId": self.config.emRoomId
                    };
                    self.connection.xmpp.sendSourceRemove(sdpDiffer, data);


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
 * @param {object} irisRtcStream - IrisRtcStream object
 * @param {json} streamConfig  - Stream config json example as mentioned above
 * @param {string} streamConfig.streamType - Type of stream audio or video
 * @param {string} streamConfig.resolution - Resolution for the video
 * @param {json} streamConfig.constraints - Media Constraints 
 * @param {string} streamConfig.constraints.audio - Media constrainsts for audio
 * @param {string} streamConfig.constraints.video - Media constrainsts for video
 * @param {string} streamConfig.screenShare - True if it is a screen share call
 */
IrisRtcSession.prototype.switchStream = function(irisRtcStream, streamConfig) {
    try {
        logger.log(logger.level.INFO, "IrisRtcSession", "Switch stream with new stream for config " + JSON.stringify(streamConfig));
        var self = this;

        if (streamConfig.screenShare) {
            logger.log(logger.level.INFO, "IrisRtcSession", "Switch stream for screen share " + JSON.stringify(streamConfig));
        }

        // Remove the present stream from the conference
        self.removeStream(self.localStream);

        // Stop the present stream
        irisRtcStream.stopMediaStream(self.localStream);

        // Create a new stream with new config
        irisRtcStream.createStream(streamConfig).then(function(stream) {
            if (stream) {
                if (streamConfig.screenShare) {
                    irisRtcStream.createStream({ streamType: "audio" }).then(function(audioStream) {
                        if (audioStream) {
                            var audioTrack = audioStream.getAudioTracks()[0];
                            if (audioTrack) {
                                logger.log(logger.level.VERBOSE, "IrisRtcSession", "Audio Track is received ", audioTrack);
                                stream.addTrack(audioTrack);
                                self.addStream(stream);
                                self.sendSwitchStreamAdd();
                            }
                        }
                    });
                } else {
                    self.sendSwitchStreamAdd();
                }
                self.localStream = stream;
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
                "rootNodeId": self.config.rootNodeId,
                "childNodeId": self.config.childNodeId,
                "traceid": this.traceId,
            };
            // Send session-accept
            self.connection.xmpp.sendSessionAccept(data);

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
 */
IrisRtcSession.prototype.videoMuteToggle = function() {

    try {
        var self = this;
        if (self.localStream && self.localStream.getVideoTracks().length >= 1 && self.localStream.getVideoTracks()[0]) {
            this.isVideoMuted = this.localStream.getVideoTracks()[0].enabled;
            logger.log(logger.level.INFO, "IrisRtcSession", "videoMuteToggle : Video Mute : " + !this.isVideoMuted);
            this.config.videomuted = this.isVideoMuted.toString();

            if (this.isVideoMuted)
                this.localStream.getVideoTracks()[0].enabled = false;
            else
                this.localStream.getVideoTracks()[0].enabled = true;

            this.isVideoMuted = this.localStream.getVideoTracks()[0].enabled;
            logger.log(logger.level.INFO, "IrisRtcSession", "videoMuteToggle : Video Mute : " + !this.isVideoMuted);
            this.connection.xmpp.stopPresenceAlive();
            this.connection.xmpp.sendPresence(this.config);
            this.connection.xmpp.sendPresenceAlive(this.config);
        } else {
            logger.log(logger.level.WARNING, "IrisRtcSession", "videoMuteToggle: No video to mute");
        }
    } catch (error) {
        logger.log(logger.level.ERROR, "IrisRtcSession", "videoMuteToggle : Failed to mute video");

    }
};

/**
 * Mute or Unmute local audio
 */
IrisRtcSession.prototype.audioMuteToggle = function() {

    try {
        var self = this;
        if (self.localStream && self.localStream.getAudioTracks().length >= 1 && self.localStream.getAudioTracks()[0]) {
            this.isAudioMuted = this.localStream.getAudioTracks()[0].enabled;
            logger.log(logger.level.INFO, "IrisRtcSession", "audioMuteToggle :: Audio Mute : " + this.isAudioMuted);

            this.config.audiomuted = this.isAudioMuted.toString();
            if (this.isAudioMuted)
                this.localStream.getAudioTracks()[0].enabled = false;
            else
                this.localStream.getAudioTracks()[0].enabled = true;
            this.connection.xmpp.stopPresenceAlive();
            this.connection.xmpp.sendPresence(this.config);
            this.connection.xmpp.sendPresenceAlive(this.config);
        } else {
            logger.log(logger.level.WARNING, "IrisRtcSession", "audioMuteToggle: No audio to mute");
        }

    } catch (error) {
        logger.log(logger.level.ERROR, "IrisRtcSession", "audioMuteToggle : Failed to mute audio");

    }
};

/**
 * API to set dispaly name for the user
 * @param {string} name - Name for the user
 */
IrisRtcSession.prototype.setDisplayName = function(name) {
    this.config.name = name;
    this.connection.xmpp.stopPresenceAlive();
    this.connection.xmpp.sendPresence(this.config);
    this.connection.xmpp.sendPresenceAlive(this.config);
};

/** 
 * Set properties
 * @param {json} 
 * @private
 */
IrisRtcSession.prototype.setProperties = function(json) {
    logger.log(logger.level.INFO, "IrisRtcSession", "setProperties");

    switch (json.property) {

        case "mute":
            this.mute(json.value);
            break;
        case 'hold':
            this.pstnHold(json.value);
            break;
        case 'merge':
            this.connection.xmpp.sendMerge();
            break;
        case 'shutter':
            break;
        case 'volume':
            break;
        case 'minBitrate':
            break;
        case 'maxBitrate':
            break;
        case 'preferredCodec':
            break;
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
 * Get properties
 * @private
 */
IrisRtcSession.prototype.getProperties = function() {
    logger.log(logger.level.INFO, "IrisRtcSession", "getProperties");

    // TODO: Retrieve properties
    var json = {};
    return json;
};

// Mute/unmute audio
//
// @param
// @api public
//
/*IrisRtcSession.prototype.mute = function (value) {
    logger.log(logger.level.INFO, "IrisRtcSession", "mute:"+value);
   
    if(value == "true") 
      this.stream.getAudioTracks()[0].enabled = false;
    else
      this.stream.getAudioTracks()[0].enabled = true;  
}*/

/**
 * This API allows user put a PSTN call on hold and unhold the call
 * @param {boolean} value - Boolean to set pstn call on hold
 */
IrisRtcSession.prototype.pstnHold = function(value) {
    logger.log(logger.level.INFO, "IrisRtcSession", "PSTN call hold : " + value);

    if (value)
        this.connection.xmpp.sendHold(this.config);
    else
        this.connection.xmpp.sendUnHold(this.config);
};

/**
 * This API allows to user to hang up the PSTN call
 */
IrisRtcSession.prototype.pstnHangup = function() {
    logger.log(logger.level.INFO, "IrisRtcSession", "hangup");

    this.connection.xmpp.sendHangup(this.config);
};

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
IrisRtcSession.prototype.onJoined = function(roomId, sessionId, myJid) {
    this.onSessionJoined(roomId, sessionId, myJid);
}


/**
 * onParticipantJoined callback
 * @private
 */
IrisRtcSession.prototype.onParticipantJoined = function(roomName, sessionId, participantJid) {
    this.onSessionParticipantJoined(roomName, sessionId, participantJid);
};

/**
 * onParticipantLeft callback
 * @private
 */
IrisRtcSession.prototype.onParticipantLeft = function(roomName, sessionId, participantJid, closeSession) {
    this.onSessionParticipantLeft(roomName, sessionId, participantJid, closeSession);
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
                self.onParticipantVideoMuted(id, videoMute);
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
                self.onParticipantAudioMuted(id, audioMute);
            }
        }
    });
};

/**
 * Called when participant's auido is muted
 * @param {string} jid - Unique jid of the participant
 * @param {string} audioMute - Status of audio. True - Muted. False - Not muted
 */
IrisRtcSession.prototype.onParticipantAudioMuted = function(jid, audioMute) {

};

/**
 * Called when participant's video is muted
 * @param {string} jid - Unique jid of the participant
 * @param {string} videoMute - Status of video. True - Muted. False - Not muted
 */
IrisRtcSession.prototype.onParticipantVideoMuted = function(jid, videoMute) {

};

/**
 * @private
 */
IrisRtcSession.prototype.onDisplayNameChange = function(id, nick) {
    var self = this;
    Object.keys(this.participants).forEach(function(jid) {
        if (jid == id) {
            if (!(self.participants[jid].nick == nick)) {
                self.participants[jid].nick = nick;
                self.onUserProfileChange(id, { "displayName": nick });
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
            self.onUserProfileChange(id, { "status": status });
        }
    });
};

/**
 * Called when there is a change in uset profile. ex.Dispalyname
 * @param {string} jid - Unique jid of the user
 * @param {json} profileJson - Json with user profile 
 * @param {string} profileJson.displayName - Name of the participant
 * @param {string} profileJson.status - Status of pstn call
 */
IrisRtcSession.prototype.onUserProfileChange = function(jid, profileJson) {
    //
};


/**
 * Called when websocket has a error
 * @private
 */
IrisRtcSession.prototype.sendEvent = function(sessionid, state, details) {
    var eventdata = { "type": "session", "sessionid": sessionid, "state": state, "details": details };

    this.onEvent(eventdata);

    if (!this.config.routingId || !this.config.traceId) return;

    var json = {
        "routingId": this.config.routingId,
        "traceId": this.config.traceId
    };
    this.sdkStats.eventLogs(state, json);
};

/**
 * Called when connection has an event
 * @param {object} event - SDK events
 * @private
 */
IrisRtcSession.prototype.onEvent = function(event) {
    // 
};


// This is a special method to listen to incoming call events
// Please note that this is not part of the object so 
// should be invoked directly
// @param {connection} a IRIS RTC Connection object to send messages
// @returns {retValue} 0 on success, negative value on error
// @api public
//
// Function to enable debug logs in webrtc.node
//
// @param Nothing
// @returns Nothing
//
function setWebRTCDebug(flag) {
    // WebRTC.setDebug(flag)
}

/**
 * Function to create sessionId
 * @private 
 */
function sid() {
    function s4() {
        return Math.floor((1 + Math.random()) * 0x10000)
            .toString(4)
            .substring(1);
    }
    return s4();
}

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
 * This API is called to create a new Iris Rtc session or to join a incoming call. 
 * In case of anonymous call client application should pass <code>stream</code> having local media tracks for creating/joining a session.
 * In case of non-anonymous call client application should pass <code>config</code>, <code>connection</code> and <code>stream</code>.
 * For incoming calls client should pass notification information in <code>config</code> with the 
 * required parameters to join session.
 * 
 * This method makes call to event manager APIs /events/createxmpprootevent to get required roomId to join session. 
 * IrisToken is must for calling any event manager APIs.
 * For anonymous call <code>/events/createxmpprootevent</code> is called with <code>roomName</code>, <code>irisToken</code>, <code>routingId</code> of caller.<br/>
 * For non-anonymous calls <code>/events/createxmpprootevent</code> is called with <code>irisToken</code>, <code>routingId</code> of caller
 * and array of routingId's of <code>participants</code>.
 *
 * Internally /events/createxmpprootevent of event manager is responsible for posting notifications to server.<br/>
 *
 * @param {object} stream - Local media stream
 * @param {json} config - A json object having all parameters required to create a room
 * @param {object} connection - IrisRtcConnection object
 */

IrisRtcSession.prototype.createSession = function(config, connection, stream) {

    var self = this;
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
    } else if (config.stream == "recvonly" && stream) {
        logger.log(logger.level.ERROR, "IrisRtcSession", "Stream is not required for recvonly calls");
        return;
    } else if ((config.type == "video" || config.type == "audio") && !stream && config.stream != "recvonly") {
        logger.log(logger.level.ERROR, "IrisRtcSession",
            " local media stream cannot be null for video or audio call ");
        return;
    } else {
        logger.log(logger.level.INFO, "IrisRtcSession",
            " Create session with config " + JSON.stringify(config));

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
 */
IrisRtcSession.prototype.joinSession = function(config, connection, stream, notificationPayload) {
    var self = this;
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
        config.roomName = notificationPayload.roomId;
        config.roomtoken = notificationPayload.roomtoken;
        config.roomtokenexpirytime = notificationPayload.roomtokenexpirytime;
        config.traceId = notificationPayload.traceId;

        // Use custom xmmp server if available
        if (rtcConfig.json.rtcServer) {
            config.rtcServer = rtcConfig.json.rtcServer;
            connection.xmpp.rtcServer = rtcConfig.json.rtcServer;
        } else {
            config.rtcServer = notificationPayload.rtcserver;
            connection.xmpp.rtcServer = notificationPayload.rtcserver;
        }

        config.sessionType = "join";

        logger.log(logger.level.INFO, "IrisRtcSession",
            " join session with config " + JSON.stringify(config));

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
 */
IrisRtcSession.prototype.createChatSession = function(config, connection) {
    var self = this;
    if (!config || config.type != "chat") {
        logger.log(logger.level.ERROR, "IrisRtcSession",
            " Invalid config or config.type, config.type should be chat ");
    } else if (!connection) {
        logger.log(logger.level.ERROR, "IrisRtcSession",
            " Invalid rtc connection !! ");
    } else if (!config.roomId || config.type != "chat") {
        logger.log(logger.level.ERROR, "IrisRtcSession",
            " Check the missing parameters " + JSON.stringify(config));
    } else {
        logger.log(logger.level.INFO, "IrisRtcSession",
            " Create session with config " + JSON.stringify(config));

        config.sessionType = "create";

        self.create(config, connection);
    }
};

/**
 *  This API is called to join a Iris Rtc session incase of  non-anonymous chat call.
 * For incoming calls client should pass notification information having required parameters to join session.<br/>
 * notification payload sent to this API must have <code>roomid</code>, <code>roomtoken</code> and <code>roomtokenexpirytime</code>.
 * @param {json} config - A json object having all parameters required to create a room
 * @param {object} connection - IrisRtcConnection object
 * @param {json} notificationPayload - Notification payload having roomid, roomtoken and roomtokenexpirytime
 */
IrisRtcSession.prototype.joinChatSession = function(config, connection, notificationPayload) {
    var self = this;

    if (!config || config.type != "chat") {
        logger.log(logger.level.ERROR, "IrisRtcSession",
            " Invalid config or config.type, config.type should be chat ");
    } else if (!notificationPayload) {
        logger.log(logger.level.ERROR, "IrisRtcSession",
            " Invalid notificationPayload!! ");
    } else if (!connection) {
        logger.log(logger.level.ERROR, "IrisRtcSession",
            " Invalid rtc connection !! ");
    } else if (!notificationPayload.roomId || !notificationPayload.roomtoken || !notificationPayload.roomtokenexpirytime) {
        logger.log(logger.level.ERROR, "IrisRtcSession",
            " RoomId, roomtoken and roomtokenexpirytime parameters are required");
    } else {
        config.roomId = notificationPayload.roomId;
        config.roomName = notificationPayload.roomId;
        config.roomtoken = notificationPayload.roomtoken;
        config.roomtokenexpirytime = notificationPayload.roomtokenexpirytime;
        config.traceId = notificationPayload.traceId;
        config.sessionType = "join";

        // Use custom xmmp server if available
        if (rtcConfig.json.rtcServer) {
            config.rtcServer = rtcConfig.json.rtcServer;
            connection.xmpp.rtcServer = rtcConfig.json.rtcServer;
        } else {
            config.rtcServer = notificationPayload.rtcserver;
            connection.xmpp.rtcServer = notificationPayload.rtcserver;
        }

        logger.log(logger.level.INFO, "IrisRtcSession",
            " join session with config " + JSON.stringify(config));

        self.create(config, connection);
    }
};

/**
 * @private
 */
IrisRtcSession.prototype.setLocalTracks = function() {
    var self = this;
    // Add stream to peerconnection
    if (self.peerconnection != null && self.localStream) {
        self.localStream.getTracks().forEach(function(track) {
            self.peerconnection.addTrack(track, self.localStream);
        });
    } else {
        logger.log(logger.level.ERROR, "IrisRtcSession",
            " Peerconnection is null !! ");
    }
};

/**
 * Callback for succeffully created session
 * @param {string} roomId - roomName created
 * @param {string} sessionId - Unique session id
 * @param {string} myJid - User's own jid
 */
IrisRtcSession.prototype.onSessionCreated = function(roomId) {

}

/**
 * onSessionJoined is called when caller joins session.
 * @param {string} roomId - RoomId to which user has joined 
 * @param {string} sessionId - Unique Id of the session
 * @param {string} myJid - Jid of the caller
 */
IrisRtcSession.prototype.onSessionJoined = function(roomId, sessionId, myJid) {

};

/**
 * Callback to inform session is connected successfully
 * @param {string} sessionId - Unique session id
 */
IrisRtcSession.prototype.onSessionConnected = function(sessionId) {

};

/**
 * Callback to inform remote participant joined successfully
 * @param {string} roomName - Room name of the participant joined
 * @param {string} sessionId - Session Id to which participant joined
 * @param {string} participantJid - Unique Jid of the remote participant
 */
IrisRtcSession.prototype.onSessionParticipantJoined = function(roomName, sessionId, participantJid) {

};

/**
 * Callback to inform remote participant has left the session
 * @param {string} roomName - Room name of the participant joined
 * @param {string} sessionId - Session Id to which participant joined
 * @param {string} participantJid - Unique Jid of the remote participant
 * @param {boolean} closeSession - Boolean value to close the session if all remote participants leave room
 */
IrisRtcSession.prototype.onSessionParticipantLeft = function(roomName, sessionId, participantJid, closeSession) {

};

/**
 * Callback to inform about the session relarted errors
 * @param {object} error - Error details from session
 */
IrisRtcSession.prototype.onError = function(error) {

};

/**
 * Callback to inform the session id for the session ended
 * @param {string} sessionId - Unique session id
 */
IrisRtcSession.prototype.onSessionEnd = function(sessionId) {

};

/**
 * API to receive the chat messages from other participants
 * @param {json} chatMsgJson - Chat message json from the other participant 
 * @param {string} chatMsgJson.message - Chat message from participant
 * @param {string} chatMsgJson.from - Remote participant's unique id
 * @param {UUIDv1} chatMsgJson.rootNodeId - Root node id for the message
 * @param {UUIDv1} chatMsgJson.childNodeId - Child node id for the meesage
 */
IrisRtcSession.prototype.onChatMessage = function(chatMsgJson) {

};

/**
 * Acknowledgement API for chat messages sent
 * @param {json} chatAckJson - Unique id for the each chat message sent
 * @param {string} chatAckJson.statusCode - Status code for sent message
 * @param {string} chatAckJson.statusMessage - Status message for the message sent
 * @param {string} chatAckJson.id -  Unique Id of the message sent
 * @param {string} chatAckJson.roomId -  Room id
 * @param {string} chatAckJson.rootNodeId - Root node id for the message - If message is sent
 * @param {string} chatAckJson.childNodeId - Child node id for the meesage - If message is sent
 */
IrisRtcSession.prototype.onChatAck = function(chatAckJson) {

};

/**
 * This event is called when dominant speaker changes in conference
 * @param {string} dominantSpeakerId - Dominant speaker's id
 */
IrisRtcSession.prototype.onDominantSpeakerChanged = function(dominantSpeakerId) {

};

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
 */
IrisRtcSession.prototype.endSession = function() {
    logger.log(logger.level.INFO, "IrisRtcSession",
        "endSession :: ", this);
    if (this.config.type == "pstn") {
        this.pstnHangup();
    }
    this.end();
};

/**
 * API to get the timebased uuid
 * @private
 */
IrisRtcSession.prototype.getUUIDV1 = function() {
    return uuidV1();
};
