// Copyright 2016 Comcast Cable Communications Management, LLC

// RtcXmpp.js : Javascript code for managing the websocket connection with 
//            XMPP server

// Import the modules
var logger = require('./RtcLogger.js');
var errors = require('./RtcErrors.js');
var WebSocket = require('ws');
var eventEmitter = require("events").EventEmitter;
var util = require("util");
var xmppClient = require('./node-xmpp-client')
var Stanza = xmppClient.Stanza
var Rtcconfig = require('./RtcConfig.js');
var https = require('https');
var SDPDiffer = require("./Utils/SDPDiffer.js");
var SDPUtil = require("./Utils/SDPUtil.js");
var SDP = require("./Utils/SDP.js");
var RtcEvents = require("./RtcEvents.js");
var transform = require("sdp-transform");

// Features for disco
var features = [
    "http://jabber.org/protocol/disco#info",
    "http://jabber.org/protocol/caps",
    "urn:xmpp:jingle:apps:rtp:1",
    "urn:ietf:rfc:5761",
    "urn:ietf:rfc:5888",
    "urn:xmpp:jingle:1",
    "urn:xmpp:jingle:apps:rtp:audio",
    "urn:xmpp:jingle:apps:rtp:video",
    "urn:xmpp:jingle:transports:ice-udp:1",
    "urn:xmpp:rayo:client:1"
];
// Constructor
//
// @param Nothing
// @returns {retValue} 0 on success, negative value on error
//
function RtcXmpp() {
    logger.log(logger.level.INFO, "RtcXmpp",
        " Constructor ");
    eventEmitter.call(this);
    this.ws = null;
    this.client = null;
    this.timer = null;
    this.prestimer = [];
    this.token = null;
    this.jid = null;
    this.successCb = null;
    this.errorCb = null;
    this.server = null; // Used for wss connection
    this.rtcServer = null; // Used for room
    this.xmppJid = null;
    this.sid = null;
    this.localSDP = null;
    this.index = 1;
    this.rayo_resourceid = '';
    this.sessionInitiateSdp = null;
    this.presIQ = null;
}

// Setup an event emitter
util.inherits(RtcXmpp, eventEmitter);

// Method to connect to websocket server
//
// @param {xmpptoken} token for xmpp server
// @param {xmppServer} Xmpp server url
// @returns {retValue} 0 on success, negative value on error
//
RtcXmpp.prototype.connect = function connect(server, path, jid, traceId, token) {

        logger.log(logger.level.INFO, "RtcXmpp",
            " Connecting to server at  " + "wss://" + server + path);

        // If already not created 
        /*if (this.client != null )
        {
          logger.log(logger.level.INFO, "RtcXmpp.connect", 
                    " Client already connected ");
          return;
        }*/

        // Create the xmpp client
        this.client = new xmppClient({
            jid: jid,
            password: "",
            preferred: 'NOAUTH',
            xmlns: 'jabber:client',
            websocket: {
                url: "wss://" + server + path,
            },
            irisOptions: {
                routingId: jid,
                traceid: traceId
            }
        });

        // Assign self
        var self = this;

        // Store variables
        this.jid = jid;
        this.token = token;
        this.server = server;

        // Register for events emitted from XMPP client
        this.client.on('stanza', function(stanza) {
            //logger.log(logger.level.INFO, "RtcXmpp.connect", 'Received stanza: ' +  stanza.toString())
            self.onMessage(stanza);
        });

        // Online event
        this.client.on('online', function(data) {
            logger.log(logger.level.INFO, "RtcXmpp.connect", "XMPP connection established" +
                " data " + JSON.stringify(data));

            // Store jid
            self.xmppJid = data.jid;

            self.emit('onOpen', data.jid);

            // Start a timer to send ping to keep this connection alive
            self.startPing();

        });

        // Offline event
        this.client.on('offline', function() {
            logger.log(logger.level.INFO, "RtcXmpp.connect", "XMPP connection disconnected");

            // Stop the ping timer
            //clearTimeout(self.timer);
            self.stopPing();

            this.client = null;

            self.emit('onClose');
        });

        // Error event
        this.client.on('error', function(e) {
            logger.log(logger.level.INFO, "RtcXmpp.connect error ", e);
            self.emit('onError', e);
        });
    }
    // Method to disconnect from websocket server
    //
    // @param {Nothing}
    // @returns {retValue} 0 on success, negative value on error
    //
RtcXmpp.prototype.disconnect = function disconnect() {
        this.client = null; // Is there a disconnect method?
        this.ws = null;
        this.client = null;
        this.timer = null;
        this.prestimer = [];
        this.token = null;
        this.jid = null;
        this.successCb = null;
        this.errorCb = null;
        this.server = null;
        this.xmppJid = null;
        this.sid = null;
        this.localSDP = null;
        this.presIQ = null;
    }
    // Method to create xmpp root event
    //
    // @param None
    // @returns {retValue} 0 on success, negative value on error
    //
RtcXmpp.prototype.sendCreateRootEventWithRoomId = function sendCreateRootEventWithRoomId(config) {

    logger.log(logger.level.VERBOSE, "RtcXmpp",
        " sendCreateRootEventWithRoomId called ");

    // Send a private IQ for createxmpprootevent
    if (!Rtcconfig.json.useEmPrivateIQ) {
        // Call event manager directly
        // Options for anonymous login request
        var options = {
            host: Rtcconfig.json.urls.eventManager,
            path: '/v1/xmpp/createrootevent/room/' + config.roomId,
            method: 'PUT',
            headers: {
                "Authorization": this.token,
                "Content-Type": "application/json",
                "Trace-Id": config.traceId
            }
        };

        // Set the event type
        var eventType;
        if (config.type == "video")
            eventType = "videocall";
        else if (config.type == "audio" || config.type == "pstn")
            eventType = "audiocall";
        else if (config.type = "chat")
            eventType = "chat";

        // JSON body 
        var jsonBody = {
            "from": this.jid,
            "event_type": eventType,
            "time_posted": Date.now(),
            "userdata": config.userData ? config.userData : ""
        };

        logger.log(logger.level.VERBOSE, "RtcXmpp",
            " Create root event with roomid with  options " + JSON.stringify(options) +
            " & body " + JSON.stringify(jsonBody));

        var self = this;

        // Create a try and catch block
        try {
            // Send the http request and wait for response
            var req = https.request(options, function(response) {
                var body = ''

                // Callback for data
                response.on('data', function(chunk) {
                    body += chunk;
                });

                // Callback when complete data is received
                response.on('end', function() {
                    logger.log(logger.level.INFO, "IrisRtcConnection",
                        " Received server response  " + body);

                    // check if the status code is correct
                    if (response.statusCode != 200) {
                        logger.log(logger.level.ERROR, "RtcXmpp",
                            " Create root event with roomid failed with status code  " +
                            response.statusCode + " & response " + body);

                        // emit the error event
                        self.emit('onCreateRootEventWithRoomIdError', new Error("RtcXmpp",
                            " Create root event with roomid failed with status code  " +
                            response.statusCode + " & response " + body));

                        return;
                    }

                    // Get the the response json
                    var resJson = JSON.parse(body);
                    resJson["sessionId"] = config.sessionId;
                    resJson["config"] = config;
                    self.rtcServer = resJson.eventdata.rtc_server;

                    // emit the error event
                    // self.emit('onCreateRootEventWithRoomIdSent', resJson);
                    self.emit(RtcEvents.CREATE_ROOT_EVENT_SUCCESS, resJson);
                });
            });

            // Catch errors 
            req.on('error', function(e) {
                logger.log(logger.level.ERROR, "RtcXmpp",
                    " Create root event with roomid failed with error  " + e);

                // emit the error event
                self.emit('onCreateRootEventWithRoomIdError', e);
            });

            // write json
            req.write(JSON.stringify(jsonBody));

            // Write json
            req.end();

        } catch (e) {
            logger.log(logger.level.ERROR, "RtcXmpp",
                " Create xmpp root event failed with error  " + e);
            self.errorCb(e);
        }
    }

}

/*
SEND: <presence to='al5tv9kz-evkg-irof-uaa8-ifm3tc4lkl7y@st-conference-wcdcc-001.poc.sys.comcast.net/6b8acbc9' 
xmlns='jabber:client'><x xmlns='http://jabber.org/protocol/muc'>
<nick xmlns='http://jabber.org/protocol/nick'>rdkcRaspberryPi</nick></x>

<user-agent xmlns='http://jitsi.org/jitmeet/user-agent'>Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/46.0.2490.86 Safari/537.36</user-agent>
<devices><audio>true</audio><video>true</video></devices></presence>\

<presence to='888bec74-a2c1-11e6-8541-fa163ece81a1@st-conference-asb-001.poc.sys.comcast.net/b9sodnff-utwm-misc-v7hj-2a2kra8oyzdr@irisconnect.comcast.com/c7438ef7-836b-4376-8111-d16b63f989b3' 
xmlns='jabber:client'>
			<x xmlns='http://jabber.org/protocol/muc'/>
			<c xmlns='http://jabber.org/protocol/caps' hash='sha-1' node='http://jitsi.org/jitsimeet' ver='cvjWXufsg4xT62Ec2mlATkFZ9lk='/>
			<user-agent xmlns='http://jitsi.org/jitmeet/user-agent'>Mozilla/5.0 (Macintosh; Intel Mac OS X 10_11_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/54.0.2840.71 Safari/537.36</user-agent>
			<devices>
			<audio>true</audio>
			<video>true</video>
			</devices>
			<data xmlns='urn:xmpp:comcast:info' event='eventTypeConnect' traceid='dnyeyspi-4ts8-is12mjms' root_node_id='88904a54-a2c1-11e6-8542-fa163ece81a1' 
      child_node_id='88904a69-a2c1-11e6-8543-fa163ece81a1' host='st-xmpp-asb-001.poc.sys.comcast.net' maxparticipants='10'/>
			<audiomuted audions='http://jitsi.org/jitmeet/audio'>false</audiomuted>
			<videoType xmlns='http://jitsi.org/jitmeet/video'>camera</videoType>
			<videomuted videons='http://jitsi.org/jitmeet/video'>false</videomuted>
			</presence>

*/

// Method to send presence to a room
//
// @param None
// @returns {retValue} 0 on success, negative value on error
//
RtcXmpp.prototype.sendPresence = function sendPresence(config) {

    // Check if we want to join or leave the room
    if (config.presenceType == "leave") {
        // Join the room by sending the presence
        var pres = new xmppClient.Element(
            'presence', {
                to: config.emRoomId + '@' + this.server.replace('xmpp', 'conference') + '/' +
                    this.jid + '/' + this.xmppJid.resource,
                type: "unavailable"
            });
        this.client.send(pres.tree());

        this.stopPresenceAlive(config.emRoomId);
        delete this.prestimer[config.emRoomId];

        var elem = 0;
        for (e in this.prestimer) { elem++; }
        if (elem == 0) {
            this.startPing();
        }
    } else {
        // Join the room by sending the presence
        var pres = new xmppClient.Element(
                'presence', {
                    to: config.emRoomId + '@' + this.server.replace('xmpp', 'conference') + '/' +
                        this.jid + '/' + this.xmppJid.resource
                })
            .c('x', { 'xmlns': 'http://jabber.org/protocol/muc' }).up()
            .c('c', { 'xmlns': 'http://jabber.org/protocol/caps', 'hash': 'sha-1', 'node': 'http://jitsi.org/jitsimeet', 'ver': 'cvjWXufsg4xT62Ec2mlATkFZ9lk=' }).up();

        // Add nick 
        //pres = pres.getChild('x');
        /*if (config.type == "audio")
        {
          pres.c('nick', {'xmlns': 'http://jabber.org/protocol/nick'}).t('rdkcRaspberryPi');
          pres = pres.up();
          pres.c('user-agent', {'xmlns': 'http://jitsi.org/jitmeet/user-agent'}).t('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/46.0.2490.86 Safari/537.36');
          pres = pres.c('devices')
          pres.c('audio').t('true');
          pres.c('video').t('true');
          pres = pres.up();
        }*/
        pres.c('user-agent', { 'xmlns': 'http://jitsi.org/jitmeet/user-agent' }).t('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/46.0.2490.86 Safari/537.36');
        pres = pres.c('devices')
        pres.c('audio').t('true');
        pres.c('video').t('true');
        pres = pres.up();

        if (typeof config.audiomuted !== 'undefined') {
            pres.c('audiomuted').t(config.audiomuted);
        }

        if (typeof config.videomuted !== 'undefined') {
            pres.c('videomuted').t(config.videomuted);
        }
        if (config.name) {
            pres.c('nick').t(config.name);
        }

        pres.c('data', {
            'xmlns': "urn:xmpp:comcast:info",
            'traceid': config.traceId,
            'childnodeid': config.childNodeId,
            'rootnodeid': config.rootNodeId,
            'event': "eventTypeConnect",
            'host': this.server,
            'roomtoken': config.roomtoken,
            'roomtokenexpirytime': config.roomtokenexpirytime
                /*'initiator': "true"*/
        }).up();

        // Store the presence IQ
        this.presIQ = pres;
        this.client.send(pres.tree());
        // Wait for a presence error or presence ack (self)
    }
}

// Method to send presence to a room
//
// @param None
// @returns {retValue} 0 on success, negative value on error
//
RtcXmpp.prototype.sendPresenceAlive = function sendPresenceAlive(config) {

    var self = this;

    // Stop the ping timer
    this.stopPing();

    // Join the room by sending the presence
    var pres = new xmppClient.Element(
        'presence', {
            to: config.emRoomId + '@' + this.server.replace('xmpp', 'conference') + '/' +
                this.jid + '/' + this.xmppJid.resource
        });
    pres.c('data', {
        'xmlns': "urn:xmpp:comcast:info",
        'traceid': config.traceId,
        'childnodeid': config.childNodeId,
        'rootnodeid': config.rootNodeId,
        'event': "eventTypeConnect",
        'host': this.server,
        'type': 'periodic'
    }).up();

    // Start a timer to send presence at interval
    this.prestimer[config.emRoomId] = setInterval(function() {
        self.client.send(pres.tree());
    }, Rtcconfig.json.presInterval);
}

// Method to send presence alive
//
// @param None
// @returns {retValue} 0 on success, negative value on error
//
RtcXmpp.prototype.stopPresenceAlive = function stopPresenceAlive(roomid) {

    // Stop the presence timer
    clearInterval(this.prestimer[roomid]);
}

// Method to send ping
//
// @param None
// @returns {retValue} 0 on success, negative value on error
//
RtcXmpp.prototype.startPing = function startPing() {

    var self = this;

    // Start a timer to send ping to keep this connection alive
    self.timer = setInterval(function() {
        // Send a ping message
        var ping = new Stanza(
            'iq', { id: 'c2s1', type: 'get' }
        ).c('ping', { xmlns: 'urn:xmpp:ping' });

        self.client.send(ping);

    }, Rtcconfig.json.pingInterval);
}

// Method to stop ping
//
// @param None
// @returns {retValue} 0 on success, negative value on error
//
RtcXmpp.prototype.stopPing = function stopPing() {

    // Stop the ping timer
    clearInterval(this.timer);
}

// Method to send session-accept 
//
// @param {data} - Configuration 
// @returns {retValue} 0 on success, negative value on error
//
RtcXmpp.prototype.sendSessionAccept = function sendSessionAccept(data) {
    logger.log(logger.level.VERBOSE, "RtcXmpp",
        " sendSessionAccept, to " + data.to);

    var accept = new xmppClient.Element(
            'iq', { to: data.to, type: 'set', id: this.index.toString() + ':sendIQ' })
        .c('jingle', {
            'xmlns': 'urn:xmpp:jingle:1',
            action: 'session-accept',
            initiator: data.to,
            responder: this.xmppJid.toString(),
            sid: this.sid
        }).c('data', {
            'xmlns': "urn:xmpp:comcast:info",
            'traceid': data.traceId,
            'childnodeid': data.childNodeId,
            'rootnodeid': data.rootNodeId,
            'event': "eventTypeConnect",
            'host': this.server
        }).up();

    // Create a variable for SDP
    this.localSDP = new SDP(data.sdp);

    this.index++;

    // get the xmpp element
    accept = this.localSDP.toJingle(accept, 'responder');

    // Send the session-initiate
    this.client.send(accept.tree());
}

// Method to send session-initiate
//
// @param {data} - Configuration 
// @returns {retValue} 0 on success, negative value on error
//
RtcXmpp.prototype.sendSessionInitiate = function sendSessionInitiate(data) {
        logger.log(logger.level.VERBOSE, "RtcXmpp",
            " sendSessionInitiate, to " + data.to);
        if (!this.sid) {
            this.sid = sid();
        }
        var initiate = new xmppClient.Element(
                'iq', {
                    to: data.emRoomId + '@' + this.server.replace('xmpp', 'conference') + '/' +
                        data.to,
                    type: 'set',
                    id: this.index.toString() + ':sendIQ'
                })
            .c('jingle', {
                'xmlns': 'urn:xmpp:jingle:1',
                action: 'session-initiate',
                initiator: this.xmppJid.toString(),
                responder: data.to,
                sid: this.sid
            }).c('data', {
                'xmlns': "urn:xmpp:comcast:info",
                'traceid': data.traceId,
                'childnodeid': data.childNodeId,
                'rootnodeid': data.rootNodeId,
                'event': "eventTypeConnect",
                'host': this.server
            }).up();

        this.index++;
        // Create a variable for SDP
        this.localSDP = new SDP(data.sdp);

        // get the xmpp element
        initiate = this.localSDP.toJingle(initiate, 'initiator');

        // Send the session-initiate
        this.client.send(initiate.tree());
    }
    // Method to send transport-info 
    //
    // @param {data} - Configuration 
    // @returns {retValue} 0 on success, negative value on error
    //
RtcXmpp.prototype.sendTransportInfo = function sendTransportInfo(data) {
    logger.log(logger.level.VERBOSE, "RtcXmpp",
        " sendTransportInfo, to " + data.to);

    var transportinfo = new xmppClient.Element(
            'iq', { to: data.to, type: 'set', id: this.index.toString() + ':sendIQ' })
        .c('jingle', {
            'xmlns': 'urn:xmpp:jingle:1',
            action: 'transport-info',
            initiator: data.to,
            //                                  responder: this.xmppJid.toString(),
            sid: this.sid
        }).c('data', {
            'xmlns': "urn:xmpp:comcast:info",
            'traceid': data.traceId,
            'childnodeid': data.childNodeId,
            'rootnodeid': data.rootNodeId,
            'event': "eventTypeConnect",
            'host': this.server
        }).up();

    this.index++;

    // Create the transport element
    for (var mid = 0; mid < this.localSDP.media.length; mid++) {
        var cands = data.candidates.filter(function(el) { return el.sdpMLineIndex == mid; });
        var mline = SDPUtil.parse_mline(this.localSDP.media[mid].split('\r\n')[0]);
        if (cands.length > 0) {
            var ice = SDPUtil.iceparams(this.localSDP.media[mid], this.localSDP.session);
            ice.xmlns = 'urn:xmpp:jingle:transports:ice-udp:1';
            transportinfo = transportinfo.c('content', {
                "creator": data.type,
                "name": (cands[0].sdpMid ? cands[0].sdpMid : mline.media)
            }).c('transport', ice);
            for (var i = 0; i < cands.length; i++) {
                transportinfo.c('candidate', SDPUtil.candidateToJingle(cands[i].candidate));
            }
            // add fingerprint
            var fingerprint_line = SDPUtil.find_line(this.localSDP.media[mid], 'a=fingerprint:', this.localSDP.session);
            if (fingerprint_line) {
                var tmp = SDPUtil.parse_fingerprint(fingerprint_line);
                tmp.required = true;
                transportinfo = transportinfo.c(
                        'fingerprint', { xmlns: 'urn:xmpp:jingle:apps:dtls:0' })
                    .t(tmp.fingerprint);
                delete tmp.fingerprint;

                // Traverse through the variable tmp
                for (var key in tmp) {
                    transportinfo.attr(key, tmp[key]);
                }
                transportinfo = transportinfo.up();

            }
            transportinfo = transportinfo.up(); // transport
            transportinfo = transportinfo.up(); // content			
        }
    }

    // Send the session-initiate
    this.client.send(transportinfo.tree());
}

// Method to send capabilities
//
// @param {data} - Configuration 
// @returns {retValue} 0 on success, negative value on error
//
RtcXmpp.prototype.sendCapabilities = function sendCapabilities(data) {

    // If we received a correct disco request, lets respond
    logger.log(logger.level.INFO, "RtcXmpp._onDiscoInfo",
        " Received query for disco, lets respond");

    var discoResult = new xmppClient.Element(
            'iq', { id: data.id, to: data.to, type: 'result' })
        .c('query', { 'xmlns': 'http://jabber.org/protocol/disco#info' }).up();
    this.index++;

    // Go to child "query"
    var query = discoResult.getChild("query");

    // Add features
    features.forEach(function(feature) {
        query.c('feature', { "var": feature });
    });

    // Add data element
    discoResult.c('data', {
        'xmlns': "urn:xmpp:comcast:info",
        'traceid': data.traceId,
        'childnodeid': data.childNodeId,
        'rootnodeid': data.rootNodeId,
        'event': "eventTypeConnect",
        'host': this.server
    });
    this.client.send(discoResult.tree());
}

// Method to request capabilities
//
// @param {data} - Configuration 
// @returns {retValue} 0 on success, negative value on error
//
/** */
RtcXmpp.prototype.requestCapabilities = function requestCapabilities(data) {

        // If we received a correct disco request, lets respond
        logger.log(logger.level.INFO, "RtcXmpp",
            " requestCapabilities");

        var caps = new xmppClient.Element(
                'iq', { from: this.xmppJid.toString(), to: data.to, type: 'get', id: this.index.toString() + ':sendIQ' })
            .c('query', { 'xmlns': 'http://jabber.org/protocol/disco#info' }).up();
        this.index++;

        this.client.send(caps.tree());
    }
    // Method to send allocate request
    //
    // @param {data} - Configuration 
    // @returns {retValue} 0 on success, negative value on error
    //
RtcXmpp.prototype.sendAllocate = function sendAllocate(data) {
    logger.log(logger.level.VERBOSE, "RtcXmpp",
        " sendAllocate ");

    // Request the capability
    var data_ = {
        "to": this.xmppJid.domain,
        'childnodeid': data.childNodeId,
        'rootnodeid': data.rootNodeId,
        'event': "eventTypeConnect",
        'host': this.server,
        "traceid": data.traceId,
        "emRoomId": data.emRoomId,
        "roomtoken": data.roomtoken,
        "roomtokenexpirytime": data.roomtokenexpirytime
    };
    this.requestCapabilities(data_);

    var evntType = "eventTypeConnect";
    if (data.type == "pstn") {
        evntType = "eventTypeConnect PSTN";
    }

    // Join the room by sending the presence
    var allocate = new xmppClient.Element(
            'iq', { to: this.server.replace('xmpp', 'focus'), "type": "set", id: this.index.toString() + ':sendIQ' })
        .c('conference', {
            'xmlns': 'http://jitsi.org/protocol/focus',
            'room': data.emRoomId + '@' + this.server.replace('xmpp', 'conference'),
            'machine-uid': sid()
        }).up();
    this.index++;
    // Go to child "conference"
    conference = allocate.getChild("conference");

    // Add properties
    conference.c('property', { "name": "bridge", "value": "jitsi-videobridge." + this.server });
    conference.c('property', { "name": "call_control", "value": this.server.replace('xmpp', 'callcontrol') });
    conference.c('property', { "name": "channelLastN", "value": "-1" });
    conference.c('property', { "name": "adaptiveLastN", "value": "false" });
    conference.c('property', { "name": "adaptiveSimulcast", "value": "false" });
    conference.c('property', { "name": "openSctp", "value": "true" });
    //conference.c('property', {"name": "enableFirefoxHacks", "value": "false"});
    conference.c('property', { "name": "simulcastMode", "value": "rewriting" });

    // Add data element
    allocate.c('data', {
        'xmlns': "urn:xmpp:comcast:info",
        'traceid': data.traceId,
        'childnodeid': data.childNodeId,
        'rootnodeid': data.rootNodeId,
        'event': evntType,
        'host': this.server,
        'roomtoken': data.roomtoken,
        'roomtokenexpirytime': data.roomtokenexpirytime
    });
    this.client.send(allocate.tree());
}

// Method to send rayo command
//
// @param {data} - Configuration 
// @returns {retValue} 0 on success, negative value on error
//
RtcXmpp.prototype.sendRayo = function sendRayo(data) {
    logger.log(logger.level.VERBOSE, "RtcXmpp",
        " sendRayo, to " + data.participants);
    // Join the room by sending the presence

    // Remove +1 from callee number
    if (data.toTN.includes('+1')) {
        data.toTN = data.toTN.replace('+1', '');
    }

    var rayo = new xmppClient.Element(
            'iq', { to: data.focusJid, "type": "set", id: this.index.toString() + ':sendIQ' })
        .c('dial', {
            'xmlns': 'urn:xmpp:rayo:1',
            'to': data.toTN,
            'from': data.fromTN
        })
        .c('header', { 'name': 'JvbRoomName', "value": data.emRoomId + '@' + this.server.replace('xmpp', 'conference') }).up().up();
    rayo.c('data', {
        xmlns: 'urn:xmpp:comcast:info',
        event: 'eventTypeConnect PSTN',
        traceid: data.traceId,
        rootnodeid: data.rootNodeId,
        childnodeid: data.childNodeId,
        host: this.server,
        toroutingid: data.toRoutingId,
        roomtoken: data.roomtoken,
        roomtokenexpirytime: data.roomtokenexpirytime
    }).up();

    this.index++;
    // send the rayo command
    this.client.send(rayo.tree());
}

// Method to send Hangup command
//
// @param {data} - Configuration
// @returns {retValue} 0 on success, negative value on error
//
RtcXmpp.prototype.sendHangup = function sendHangup(config) {
    logger.log(logger.level.VERBOSE, "RtcXmpp",
        " sendHangup");
    var roomJid = config.emRoomId + '@' + this.server.replace('xmpp', 'callcontrol');

    // Join the room by sending the presence
    var hangup = new xmppClient.Element(
            'iq', { to: roomJid + "/" + this.rayo_resourceid, "type": "set", id: this.index.toString() + ':sendIQ' })
        .c('hangup', { 'xmlns': 'urn:xmpp:rayo:1' }).up();
    this.index++;
    // send the rayo command
    this.client.send(hangup.tree());
}

// Method to send Hold command
//
// @param {data} - Configuration
// @returns {retValue} 0 on success, negative value on error
//
RtcXmpp.prototype.sendHold = function sendHold(config) {
    logger.log(logger.level.VERBOSE, "RtcXmpp",
        " sendHold");

    var roomJid = config.emRoomId + '@' + this.server.replace('xmpp', 'callcontrol');

    // Join the room by sending the presence
    var hold = new xmppClient.Element(
            'iq', { to: roomJid + "/" + this.rayo_resourceid, from: this.jid + '/' + this.xmppJid.resource, "type": "set", id: this.index.toString() + ':sendIQ' })
        .c('hold', { 'xmlns': 'urn:xmpp:rayo:1' }).up();
    this.index++;
    // send the rayo command
    this.client.send(hold.tree());
}

// Method to send UnHold command
//
// @param {data} - Configuration
// @returns {retValue} 0 on success, negative value on error
//
RtcXmpp.prototype.sendUnHold = function sendUnHold(config) {
    logger.log(logger.level.VERBOSE, "RtcXmpp",
        " sendUnHold");
    var roomJid = config.emRoomId + '@' + this.server.replace('xmpp', 'callcontrol');

    // Join the room by sending the presence
    var unhold = new xmppClient.Element(
            'iq', { to: roomJid + "/" + this.rayo_resourceid, from: this.jid + '/' + this.xmppJid.resource, "type": "set", id: this.index.toString() + ':sendIQ' })
        .c('unhold', { 'xmlns': 'urn:xmpp:rayo:1' }).up();
    this.index++;
    // send the rayo command
    this.client.send(unhold.tree());
}

// Method to send merge command
//
// @param {data} - Configuration
// @returns {retValue} 0 on success, negative value on error
//
RtcXmpp.prototype.sendMerge = function sendMerge() {
    logger.log(logger.level.VERBOSE, "RtcXmpp",
        " sendMerge");

    var merge = new xmppClient.Element(
            'iq', { to: this.rayo_resourceid, from: this.jid, "type": "set", id: this.index.toString() + ':sendIQ' })
        .c('merge', { 'xmlns': 'urn:xmpp:rayo:1' }).up();
    this.index++;
    // send the rayo command
    this.client.send(merge.tree());
}


RtcXmpp.prototype.sendSourceAdd = function sendSourceAdd(sdpDiffer, data) {
    logger.log(logger.level.VERBOSE, "RtcXmpp",
        " sendSourceAdd, to " + data.to);

    var add = new xmppClient.Element(
            'iq', { to: data.to, type: 'set', id: this.index.toString() + ':sendIQ' })
        .c('jingle', {
            'xmlns': 'urn:xmpp:jingle:1',
            action: 'source-add',
            initiator: data.to,
            responder: this.xmppJid.toString(),
            sid: this.sid
        }).c('data', {
            'xmlns': "urn:xmpp:comcast:info",
            'traceid': data.traceId,
            'childnodeid': data.childNodeId,
            'rootnodeid': data.rootNodeId,
            'event': "eventTypeConnect",
            'host': this.server
        }).up();

    // get the xmpp element
    sdpDiffer.toJingle(add);


    // Create a variable for SDP
    // this.localSDP = new SDP(data.sdp);

    this.index++;

    // get the xmpp element
    // add = this.localSDP.toJingle(add, 'initiator');

    // Send the session-initiate
    this.client.send(add.tree());
}

RtcXmpp.prototype.sendSourceRemove = function sendSourceRemove(sdpDiffer, data) {
    logger.log(logger.level.VERBOSE, "RtcXmpp",
        " sendSourceRemove, to " + data.to);

    var remove = new xmppClient.Element(
            'iq', { to: data.to, type: 'set', id: this.index.toString() + ':sendIQ' })
        .c('jingle', {
            'xmlns': 'urn:xmpp:jingle:1',
            action: 'source-remove',
            initiator: data.to,
            responder: this.xmppJid.toString(),
            sid: this.sid
        }).c('data', {
            'xmlns': "urn:xmpp:comcast:info",
            'traceid': data.traceId,
            'childnodeid': data.childNodeId,
            'rootnodeid': data.rootNodeId,
            'event': "eventTypeConnect",
            'host': this.server
        }).up();

    // get the xmpp element
    sdpDiffer.toJingle(remove);

    // Create a variable for SDP
    // this.localSDP = new SDP(data.sdp);

    this.index++;

    // get the xmpp element
    // accept = this.localSDP.toJingle(accept, 'initiator');

    // Send the session-initiate
    this.client.send(remove.tree());
}


// Method to disconnect from websocket server
//
// @param None
// @returns {retValue} 0 on success, negative value on error
//
RtcXmpp.prototype.disconnect = function disconnect() {}

// Callback to inform that connection is successful
//
// @param None
// @returns Nothing
//
RtcXmpp.prototype.onConnected = function onConnected() {}

// Callback to inform that connection is disconnected
//
// @param {error} If any
// @returns Nothing
//
RtcXmpp.prototype.onDisconnected = function onDisconnected(error) {}

// Callback to to get the stanza from xmpp
//
// @param {msg} stanza
// @returns Nothing
//
RtcXmpp.prototype.onMessage = function onMessage(stanza) {
    logger.log(logger.level.VERBOSE, "RtcXmpp.onMessage",
        " stanza. " + JSON.stringify(stanza));

    // Check if we received a presence
    if (stanza.is('presence')) {
        this._onPresence(stanza);
    } else if (stanza.is('iq')) {
        this._onIQ(stanza);
    } else if (stanza.is('message')) {
        this._onChatMessage(stanza);
    }
}

// Callback to to parse XMPP IQ
//
// @param {msg} stanza
// @returns Nothing
//
RtcXmpp.prototype._onIQ = function _onIQ(stanza) {

    // CHeck if this is a jingle message
    if (stanza.getChild('jingle')) {
        this._onJingle(stanza);
    } else if (stanza.getChild('query', "http://jabber.org/protocol/disco#info")) {
        this._onDiscoInfo(stanza);
    } else if (stanza.getChild('query', "jabber:iq:private")) {
        this._onPrivateIQ(stanza);
    } else if (stanza.getChild('ref')) {
        this._onRayoIQ(stanza);
    }


    // Check if this is ack from focus
    if (stanza.attrs && stanza.attrs.type == "result" &&
        stanza.getChild("conference")) {
        this._onConference(stanza);
    }

    // Check if this is ack from focus
    if (stanza.attrs && stanza.attrs.type == "error") {
        this.emit('onIQError', "");
    }
}

// Callback to to parse XMPP IQ
//
// @param {msg} stanza
// @returns Nothing
//
RtcXmpp.prototype._onConference = function _onConference(stanza) {

        // Check if it was a success
        var conf = stanza.getChild("conference");

        // Get focus jid
        if (conf.attrs.focusjid) {
            var data = { "focusJid": conf.attrs.focusjid };
            this.emit('onAllocateSuccess', data);
        }

    }
    // Callback to to parse XMPP IQ
    //
    // @param {msg} stanza
    // @returns Nothing
    //
RtcXmpp.prototype._onJingle = function _onJingle(stanza) {

    // We are interested in Jingle messages
    // Check if the IQ message has a element with name "jingle"
    // Get the jingle node
    var jingle = stanza.getChild('jingle');
    if (!jingle) { return; }

    this.sid = jingle.attrs.sid;
    var action = jingle.attrs.action;
    var fromJid = stanza.attrs.from;

    logger.log(logger.level.VERBOSE, "RtcXmpp.onMessage",
        " Jingle action " + jingle.attrs.action);

    // Check if the action is session-initiate
    if (jingle.attrs.action === "session-initiate") {
        // Parse session-initiate and convert it to sdp
        // Send ack first
        var ack = new xmppClient.Element('iq', {
            type: 'result',
            to: fromJid,
            id: stanza.id,
            from: stanza.attrs.to
        });

        // send ack
        this.client.send(ack.tree());

        // Create a variable for SDP
        var remoteSDP = new SDP('');

        // Convert to SDP
        remoteSDP.fromJingle(stanza);

        // Assign it for next timer
        this.sessionInitiateSdp = remoteSDP;

        // Create the json for session
        var data = {
            "jingle": jingle,
            "sdp": remoteSDP.raw,
            "roomName": stanza.attrs.from.split('@')[0],
            "from": fromJid
        };

        // send the presence message
        this.emit('onSessionInitiate', data);
    } else if (jingle.attrs.action === "session-accept") {
        // Parse session-initiate and convert it to sdp
        // Send ack first
        var ack = new xmppClient.Element('iq', {
            type: 'result',
            to: stanza.attrs.from,
            id: stanza.id,
            from: stanza.attrs.to
        });

        // send ack
        this.client.send(ack.tree());

        // Create a variable for SDP
        this.remoteSDP = new SDP('');

        // Convert to SDP
        this.remoteSDP.fromJingle(stanza);

        // Create the json for session
        var data = {
            "jingle": jingle,
            "sdp": this.remoteSDP.raw,
            "roomName": stanza.attrs.from.split('@')[0],
            "from": stanza.attrs.from
        };
        var self = this;
        process.nextTick(function() {
            // send the presence message
            self.emit('onSessionAccept', data);
        });
    } else if (jingle.attrs.action === "source-add") {
        // Send ack first
        var ack = new xmppClient.Element('iq', {
            type: 'result',
            to: stanza.attrs.from,
            id: stanza.id,
            from: stanza.attrs.to
        });

        // send ack
        this.client.send(ack.tree());

        // Create a variable for SDP
        if (this.sessionInitiateSdp == null) {
            return;
        }

        // Convert to SDP
        console.log("***return value " + this.sessionInitiateSdp.addSources(jingle));

        // Create the json for session
        var data = {
            "jingle": jingle,
            "sdp": this.sessionInitiateSdp.raw,
            "roomName": stanza.attrs.from.split('@')[0],
            "from": stanza.attrs.from
        };
        var self = this;
        process.nextTick(function() {
            // send the presence message
            self.emit('onSourceAdd', data);
        });
    } else if (jingle.attrs.action === "transport-info") {
        // Get the transport element
        var content = jingle.getChild('content');
        var transport = content.getChild('transport');

        // Send ack first
        var ack = new xmppClient.Element('iq', {
            type: 'result',
            to: stanza.attrs.from,
            id: stanza.id,
            from: stanza.attrs.to
        });

        // send ack
        this.client.send(ack.tree());

        // Check if the transport exists
        if (transport) {
            // Get the candidates
            var candidates = transport.getChildren('candidate');

            // Get the name
            var name = content.attrs.name;

            // Assign self
            var self = this;

            // Go through the candidates
            candidates.forEach(function(candidate) {
                var line, candidate;
                line = SDPUtil.candidateFromJingle(candidate);

                // Create the data
                var data = {
                    "sdpMLineIndex": 0,
                    "sdpMid": content.attrs.name,
                    "line": line,
                    "roomName": stanza.attrs.from.split('@')[0],
                    "from": stanza.attrs.from
                };

                process.nextTick(function() {
                    // send the candidate message
                    self.emit('onCandidate', data);
                });

            });
        }
    } else if (jingle.attrs.action === "source-remove") {

        // Send ack first
        var ack = new xmppClient.Element('iq', {
            type: 'result',
            to: stanza.attrs.from,
            id: stanza.id,
            from: stanza.attrs.to
        });

        // send ack
        this.client.send(ack.tree());

        // Create a variable for SDP
        if (this.sessionInitiateSdp == null) {
            return;
        }

        // Convert to SDP
        // console.log("***return value " + this.sessionInitiateSdp.removeSources(jingle));

        // Create the json for session
        var data = {
            "jingle": jingle,
            "sdp": this.sessionInitiateSdp.raw,
            "roomName": stanza.attrs.from.split('@')[0],
            "from": stanza.attrs.from
        };
        var self = this;
        process.nextTick(function() {
            // send the presence message
            self.emit('onSourceRemove', data);
        });

    } else if (jingle.attrs.action === "source-add") {
        var ack = new xmppClient.Element('iq', {
            type: 'result',
            to: fromJid,
            id: stanza.id
        });

        // send ack
        this.client.send(ack.tree());
    }


}

function getVal(stanza, child) {
    if (stanza.getChild(child)) {
        return stanza.getChild(child).getText();
    }
}


// Callback to to get the stanza from xmpp
//
// @param {msg} stanza
// @returns Nothing
//
RtcXmpp.prototype._onPresence = function _onPresence(stanza) {
        var self = this;

        // Check if there is an error in the presence
        if (stanza.attrs && stanza.attrs.type && stanza.attrs.type == "error") {
            logger.log(logger.level.ERROR, "RtcXmpp.onMessage",
                " Received presence error");
            self.emit('onPresenceError', stanza.children);
            return;
        }

        // Get the x node
        var x = stanza.getChild('x', 'http://jabber.org/protocol/muc#user');
        if (!x) { return; }

        // Retrieve item node
        var item = x.getChild('item');

        // Check if the item
        if (item) {

            logger.log(logger.level.INFO, "RtcXmpp.onMessage",
                " item " + JSON.stringify(item.attrs));

            // Check if someone is leaving the room
            if (stanza.attrs && stanza.attrs.type && stanza.attrs.type) {
                var fromField = stanza.attrs.from.substring(stanza.attrs.from.indexOf('/') + 1);
                // Create the presence config
                var presenceConfig = {
                    "jid": fromField,
                    "role": item.attrs.role,
                    "affiliation": item.attrs.affiliation,
                    "roomName": stanza.attrs.from.split('@')[0],
                    "type": stanza.attrs.type,
                    "from": stanza.attrs.from
                };

                // send the presence message
                self.emit('onPresence', presenceConfig);
            } else {
                var jid;

                // Special processing for focus
                if ((stanza.attrs.from.indexOf('f0cus') > 0) || (stanza.attrs.from.indexOf('sp00f') > 0)) {
                    jid = stanza.attrs.from;
                } else {
                    jid = stanza.attrs.from.substring(stanza.attrs.from.indexOf('/') + 1);
                }

                var videomuted = getVal(stanza, 'videomuted');
                var audiomuted = getVal(stanza, 'audiomuted');
                var nick = getVal(stanza, 'nick');
                var status = getVal(stanza, 'status');

                // Create the presence config
                var presenceConfig = {
                    "jid": jid,
                    "role": item.attrs.role,
                    "affiliation": item.attrs.affiliation,
                    "roomName": stanza.attrs.from.split('@')[0],
                    "type": "join",
                    "from": stanza.attrs.from,
                    "videomuted": videomuted,
                    "audiomuted": audiomuted,
                    "nick": nick,
                    "status": status

                };

                // send the presence message
                self.emit('onPresence', presenceConfig);
            }
        }
    }
    // Callback to to parse XMPP PRIVATE IQ
    //
    // @param {msg} stanza
    // @returns Nothing
    //
RtcXmpp.prototype._onDiscoInfo = function _onDiscoInfo(stanza) {

    var self = this;

    // Check if the query is for us
    if (stanza && stanza.attrs && stanza.attrs.to && (stanza.attrs.to == this.xmppJid.toString())) {
        // Check if the jid matches
        if (stanza.attrs.type == "get") {
            var data = { from: stanza.attrs.from, id: stanza.attrs.id };
            // send the presence message
            self.emit('onCapabilityRequest', data);
        } else if (stanza.attrs.type == "result") {
            logger.log(logger.level.INFO, "RtcXmpp._onDiscoInfo",
                " Received capabilities, not doing anything with it");
        }

    } else {
        logger.log(logger.level.ERROR, "RtcXmpp._onDiscoInfo",
            " Received disco info error");
    }
}


// Callback to to parse XMPP PRIVATE IQ
//
// @param {msg} stanza
// @returns Nothing
//
RtcXmpp.prototype._onPrivateIQ = function _onPrivateIQ(stanza) {

    var self = this;

    // Get the query node
    var privateiq = stanza.getChild('query');
    if (!privateiq) { return; }

    // Retrieve data node
    var data = privateiq.getChild('data');

    // Check if the data is avaialable
    if (data) {

        // Check if it has required config
        if (!data.attrs.roomid || !data.attrs.routingid) {
            logger.log(logger.level.ERROR, "RtcXmpp._onPrivateIQ",
                "Ignoring private IQ as it doesnt have correct parameters");
            return;
        }

        // Collect traceid from notification
        var nTraceid;
        if (!data.attrs.traceid) {
            logger.log(logger.level.ERROR, "RtcXmpp._onPrivateIQ",
                "No traceId so genearating one");
            nTraceid = "";
        } else {
            nTraceid = data.attrs.traceid;
        }

        var incomingConfig = {
            "roomId": data.attrs.roomid,
            "action": data.attrs.action,
            "routingId": data.attrs.routingid,
            "rtcserver": data.attrs.rtcserver,
            "traceId": nTraceid,
            "type": "incoming",
            "userdata": data.attrs.userdata,
            "roomtoken": data.attrs.roomtoken,
            "roomtokenexpirytime": data.attrs.roomtokenexpirytime
        };

        // send the incoming message
        self.emit('onIncoming', incomingConfig);
    } else {
        logger.log(logger.level.ERROR, "RtcXmpp._onPrivateIQ",
            " Received privateiq error");
    }
}

// Callback to to parse XMPP RAYO IQ RESULT
//
// @param {msg} stanza
// @returns Nothing
//
RtcXmpp.prototype._onRayoIQ = function _onRayoIQ(stanza) {

    // Get the query node
    var ref = stanza.getChild('ref', 'urn:xmpp:rayo:1');
    if (!ref) { return; }

    // Retrieve data node
    var resource = ref.attrs.uri;
    this.rayo_resourceid = resource.substr('xmpp:'.length);

    logger.log(logger.level.INFO, "RtcXmpp",
        " OnRayo result: resourceid:", this.rayo_resourceid);

};

// Callback to to parse XMPP chat messages
//
// @param {stanza} stanza
// @returns Nothing
//
RtcXmpp.prototype._onChatMessage = function(stanza) {

    logger.log(logger.level.INFO, "RtcXmpp",
        " _onChatMessage");
    var self = this;

    if (stanza.attrs && stanza.attrs.type) {
        if (stanza.attrs.type == "chat") {
            this._onChat(stanza);
        } else if (stanza.attrs.type == "groupchat") {
            this._onGroupChat(stanza);
        }
    }
};


// Callback to to parse XMPP chat messages to mute/unmute video
//
// @param {stanza} stanza
// @returns Nothing
//
RtcXmpp.prototype._onChat = function(stanza) {

    logger.log(logger.level.INFO, "RtcXmpp",
        " _onChat");

    var self = this;
    var from = stanza.attrs.from;
    var to = stanza.attrs.to;
    var body = stanza.getChild('body');
    if (body) {
        var message = body.getText();
        logger.log(logger.level.INFO, "RtcXmpp",
            " _onChat : message: " + message);
        if (message) {
            if (message == 'mute') {

                self.emit('onMute', true);
            } else if (message == 'unmute') {
                self.emit('onMute', false);
            }
        }
    }
}


// Callback to to parse XMPP group chat messages
//
// @param {stanza} stanza
// @returns Nothing
//
RtcXmpp.prototype._onGroupChat = function(stanza) {

    logger.log(logger.level.INFO, "RtcXmpp",
        " _onGroupChat");

    var self = this;
    // var from = stanza.attrs.from.split('/')[0];
    // var to = stanza.attrs.to.split('/')[0];
    var from = stanza.attrs.from;
    var to = stanza.attrs.to;
    var body = stanza.getChild('body');
    var id = stanza.attrs.id;

    if (body) {

        //Handle chat ack messages
        if (from == to) {
            var data = stanza.getChild('data');
            if (!data || !data.attrs || !data.attrs.evmresponsecode) {
                logger.log(logger.level.ERROR, "RtcXmpp", "_onGroupChat : " + " Missing Data element or attributes in data element");
                return;
            }
            var status = parseInt(data.attrs.evmresponsecode);
            var chatAckJson = {}

            logger.log(logger.level.INFO, "RtcXmpp", "_onGroupChat : " + " Ack Received : status : " + status);
            if (status == 0) {
                chatAckJson = {
                    id: id,
                    statusCode: status,
                    statusMessage: "EVM is down"
                }
            } else if (status >= 400) {
                chatAckJson = {
                    id: id,
                    statusCode: status,
                    statusMessage: "Failed"
                }
            } else if (200 <= status < 300) {
                var rootNodeId = data.attrs.rootnodeid;
                var childNodeId = data.attrs.childnodeid;
                chatAckJson = {
                    id: id,
                    rootNodeId: rootNodeId,
                    childNodeId: childNodeId,
                    statusCode: status,
                    statusMessage: "Success"
                }
            } else {
                chatAckJson = {
                    id: id,
                    statusCode: status,
                    statusMessage: "Error"
                }
            }
            self.emit("onChatAck", chatAckJson);

        } else {
            //Handle messages from other participants

            var message = body.getText();
            logger.log(logger.level.INFO, "RtcXmpp",
                " _onGroupChat : message: " + message);

            if (message) {
                self.emit('onGroupChatMessage', message, from);
            }
        }
    }
}

RtcXmpp.prototype.sendGroupChatMessage = function(config, id, message) {
    this.index++;
    var msg = new xmppClient.Element(
            'message', {
                id: id,
                from: this.jid,
                to: config.emRoomId + '@' + this.rtcServer.replace('xmpp', 'conference'),
                type: 'groupchat',
            })
        .c('body').t(message).up()
        .c('data', {
            'xmlns': "urn:xmpp:comcast:info",
            'traceid': config.traceId,
            'host': this.server,
        }).up();
    this.client.send(msg.tree());
}


RtcXmpp.prototype.sendMute = function(to, isMute) {

    this.index++;
    var mute = new xmppClient.Element(
            'message', {
                id: this.index.toString() + ':sendPrivateMessage',
                from: this.jid,
                to: to,
                type: 'chat',
            })
        .c('body').t(isMute ? "mute" : "unmute").up();
    // send the mute/unmute private message
    this.client.send(mute.tree());

}

RtcXmpp.prototype.sendAudioMute = function(to, isMute) {

    this.index++;
    var mute = new xmppClient.Element(
            'message', {
                id: this.index.toString() + ':sendPrivateMessage',
                from: this.jid,
                to: to,
                type: 'chat',
            })
        .c('body').t(isMute ? "audioMute" : "audioUnmute").up();

    // send the mute/unmute private message
    this.client.send(mute.tree());

}


//
// Function to create random UUID
//
// @param Nothing
// @returns Nothing
//
function sid() {
    function s4() {
        return Math.floor((1 + Math.random()) * 0x10000)
            .toString(16)
            .substring(1);
    }
    return s4();
}

// Defining the API module 
module.exports = RtcXmpp;
