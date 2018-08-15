// Copyright 2018 Comcast Cable Communications Management, LLC

// RtcXmpp.js : Javascript code for managing the websocket connection with 
//            XMPP server

// Import the modules
var logger = require('./RtcLogger.js');
var errors = require('./RtcErrors.js');
var eventEmitter = require("events").EventEmitter;
var util = require("util");
var xmppClient = require('./node-xmpp-client')
var Stanza = xmppClient.Stanza
var Rtcconfig = require('./RtcConfig.js');
var SDPUtil = require("./Utils/SDPUtil.js");
var SDP = require("./Utils/SDP.js");
var RtcEvents = require("./RtcEvents.js").Events;
var async = require("async");

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
    "urn:xmpp:rayo:client:1",
    "urn:xmpp:jingle:transports:dtls-sctp:1"
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
    this.pingtimer = null;
    this.pingexpiredtimer = null;
    this.keepAliveTimer = null;
    this.pingLocalCounter = 0;
    this.prestimer = {};
    this.sessionStore = {};
    this.token = null;
    this.jid = null;
    this.server = null; // Used for wss connection
    this.xmppJid = null;
    this.sid = null;
    this.localSDP = null;
    this.index = 1;
    this.rayo_resourceid = '';
    this.userAgent = (navigator && navigator.userAgent) ? navigator.userAgent : "Iris JS SDK -v" + Rtcconfig.json.sdkVersion;
    this.isAlive = false;
    this.networkListeners = [];
    this.sendMessageQueue = async.queue(_processQueueTasks.bind(this), 1);

}

_processQueueTasks = function(task, finishedCallback) {
    task(finishedCallback);
}

// Setup an event emitter
util.inherits(RtcXmpp, eventEmitter);

// Method to connect to websocket server
//
// @param {xmpptoken} token for xmpp server
// @param {xmppServer} Xmpp server url
// @returns {retValue} 0 on success, negative value on error
//
RtcXmpp.prototype.connect = function connect(server, path, jid, resourceId, traceId, token) {

    logger.log(logger.level.INFO, "RtcXmpp",
        " connect :: Connecting to server at  " + "wss://" + server + path);

    // If already not created 
    /*if (this.client != null )
    {
      logger.log(logger.level.INFO, "RtcXmpp.connect", 
                " Client already connected ");
      return;
    }*/

    // Create the xmpp client
    this.client = new xmppClient({
        // jid: jid + "/" + resourceId,
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

    addNetworkEventListener(self);

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
        Object.keys(self.sessionStore).forEach(function(element) {
            self.emit(element, "onNetworkDisconnect");
        });
        self.isAlive = true;

        //Start a ping<->pong for every three seconds
        // self.startPingPong();

        // Start a timer to send ping to keep this connection alive
        self.startPing();

    });

    // Offline event
    this.client.on('offline', function() {
        logger.log(logger.level.INFO, "RtcXmpp.connect", "XMPP connection disconnected");
        self.stopPing();
        self.stopPresenceAlive("");
        clearTimeout(self.keepAliveTimer);
        self.client.removeAllListeners();
        self.client = null;
        self.isAlive = false;
        // removeNetworkEventListener(self);

        self.emit('onClose');
    });

    // Error event
    this.client.on('error', function(e) {
        if (e.type == 'error') {
            logger.log(logger.level.INFO, "RtcXmpp.connect error ", e);
            self.emit('onError', "XMPP connection failed");

        }
    });
}



RtcXmpp.prototype.updateOnlineOfflineStatus = function(event) {
    logger.log(logger.level.VERBOSE, "RtcXmpp",
        " RtcXmpp :: updateOnlineOfflineStatus : " + event.type);

    var self = this;

    if (event.type == "online") {

        logger.log(logger.level.INFO, "RtcXmpp",
            " RtcXmpp :: updateOnlineOfflineStatus : " + event.type);

        // Not doing anything yet

    } else if (event.type == "offline") {

        logger.log(logger.level.ERROR, "RtcXmpp",
            " RtcXmpp :: updateOnlineOfflineStatus : " + event.type);


        clearTimeout(self.keepAliveTimer);
        clearInterval(self.pingtimer);
        clearTimeout(self.pingexpiredtimer);
        self.closeWebSocket();
        self.pingLocalCounter = 0;
        self.stopPing();
        self.stopPresenceAlive("");
        self.client = null;
        self.isAlive = false;

    }
}

RtcXmpp.prototype.startPingPong = function() {
    var self = this;

    logger.log(logger.level.VERBOSE, "RtcXmpp",
        " startPingPong");

    self.keepAliveTimer = setTimeout(function() {
        logger.log(logger.level.VERBOSE, "RtcXmpp",
            " RtcXmpp :: startPingPong : isAlive : " + self.isAlive);

        if (self.isAlive) {
            self.isAlive = false;
            clearTimeout(self.keepAliveTimer);

            var ping = new Stanza('iq', { id: 'c2s1', type: 'get' })
                .c('ping', { xmlns: 'urn:xmpp:ping' });

            self.client.send(ping);

            self.startPingPong();
        } else {
            logger.log(logger.level.ERROR, "RtcXmpp",
                " PingPong  failed : close the socket connection");

            // removeNetworkEventListener(self);
            // self.client.removeAllListeners();
            clearTimeout(self.keepAliveTimer);
            clearInterval(self.pingtimer);
            clearTimeout(self.pingexpiredtimer);
            self.closeWebSocket();
            self.pingLocalCounter = 0;
            self.stopPing();
            self.stopPresenceAlive("");
            self.client = null;
            self.isAlive = false;
            // self.emit('onError', "WS connection is broken");
        }
    }, Rtcconfig.json.pingPongInterval);
}

RtcXmpp.prototype.closeWebSocket = function closeSocket() {
    logger.log(logger.level.INFO, "RtcXmpp",
        " RtcXmpp::closeWebSocket called ");

    // removeNetworkEventListener(this);

    // Check the websocket state: CONNECTING =0, OPEN=1, CLOSING=2, CLOSED=3
    if (this.client && this.client.connection && this.client.connection.websocket && this.client.connection.websocket.readyState == 1) {
        this.client.end();
        this.isAlive = false;
        return 1;
    }
    return 0;
}


// Method to send ping
//
// @param None
// @returns {retValue} 0 on success, negative value on error
//
RtcXmpp.prototype.startPing = function startPing() {

    var self = this;

    // Start a timer to send ping to keep this connection alive
    self.pingtimer = setInterval(function() {

        logger.log(logger.level.INFO, "RtcXmpp",
            " RtcXmpp :: startPing : isAlive : " + self.isAlive);

        // Send a ping message
        var ping = new Stanza(
            'iq', { id: 'c2s1', type: 'get' }
        ).c('ping', { xmlns: 'urn:xmpp:ping' });

        if (self.client) {
            self.client.send(ping);
            self.isAlive = false;
        }

        self.pingLocalCounter = self.pingLocalCounter + 1;

        if (self.pingLocalCounter >= Rtcconfig.json.pingCounter) {

            clearInterval(self.pingtimer);

            // Start ping expiry timer
            self.pingexpiredtimer = setTimeout(function() {

                logger.log(logger.level.ERROR, "RtcXmpp",
                    " PingPong  failed : close the socket connection");

                // removeNetworkEventListener(self);
                // self.client.removeAllListeners();
                clearTimeout(self.keepAliveTimer);
                clearInterval(self.pingtimer);
                clearTimeout(self.pingexpiredtimer);
                self.closeWebSocket();
                self.pingLocalCounter = 0;
                self.stopPing();
                self.stopPresenceAlive("");
                self.client = null;
                self.isAlive = false;
                // self.emit('onError', "WS connection is broken");

            }, Rtcconfig.json.pingInterval);
        }

    }, Rtcconfig.json.pingInterval);
}

// Method to stop ping
//
// @param None
// @returns {retValue} 0 on success, negative value on error
//
RtcXmpp.prototype.stopPing = function stopPing() {

    // Stop the ping timer
    clearInterval(this.pingtimer);
    clearTimeout(this.pingexpiredtimer);
    this.pingLocalCounter = 0;
}


// Method to disconnect from websocket server
//
// @param {Nothing}
// @returns {retValue} 0 on success, negative value on error
//
RtcXmpp.prototype.disconnect = function disconnect() {
    logger.log(logger.level.INFO, "RtcXmpp",
        " RtcXmpp::disconnect called ");

    if (this.client)
        this.client.end();
    // if (this.client && this.client.connection.websocket && this.client.connection.websocket.readyState == 1) {
    //     this.client.connection.websocket.close();

    // }
    this.stopPing();
    clearTimeout(self.keepAliveTimer);
    this.isAlive = false;
    this.client = null; // Is there a disconnect method?
    this.pingtimer = null;
    this.pingexpiredtimer = null;
    this.keepAliveTimer = null;
    this.pingLocalCounter = 0;
    this.prestimer = {};
    this.token = null;
    this.jid = null;
    this.server = null;
    this.xmppJid = null;
    this.sid = null;
    this.localSDP = null;
    this.isAlive = false;
    this.networkListeners = [];
    this.disconnectWS = false;
}

function removeNetworkEventListener(self) {
    if (window && self.networkListeners) {
        for (var property in self.networkListeners) {
            window.removeEventListener(property, self.networkListeners[property], false);
        }
    }
}

function addNetworkEventListener(self) {
    if (window && self.networkListeners) {
        for (var property in self.networkListeners) {
            window.removeEventListener(property, self.networkListeners[property], false);
        }
    }
    if (window) {
        window.addEventListener('online', self.networkListeners['online'] = self.updateOnlineOfflineStatus.bind(self));
        window.addEventListener('offline', self.networkListeners['offline'] = self.updateOnlineOfflineStatus.bind(self));
    }
}

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
                to: config.roomId + '@' + config.rtcServer.replace('xmpp', 'conference') + '/' +
                    this.jid + '/' + this.xmppJid.resource,
                type: "unavailable"
            });

        pres.c('data', {
            'xmlns': "urn:xmpp:comcast:info",
            'traceid': config.traceId,
            'host': this.server,
        }).up();

        if (this.client)
            this.client.send(pres.tree());

        this.stopPresenceAlive(config.roomId);
        delete this.prestimer[config.roomId];

        var elem = 0;
        for (e in this.prestimer) { elem++; }
        if (elem == 0) {
            // this.startPing();
        }

        // if (this.prestimer.length == 0 && this.disconnectWS) {
        //     this.disconnect();
        // }
        var self = this;
        delete self.sessionStore[config.roomId];
        if (self.disconnectWS) {
            if (Object.keys(self.sessionStore).length == 0) {
                self.disconnect();
            } else {
                var sessionFlag = false;
                Object.keys(self.sessionStore).forEach(function(element) {
                    if (self.sessionStore[element] !== "groupchat") {
                        sessionFlag = true;
                    }
                });
                if (sessionFlag == false) {
                    Object.keys(self.sessionStore).forEach(function(element) {
                        self.emit(element, "onDisconnectIQ");
                    });
                }
            }
        }


    } else {
        // Join the room by sending the presence
        var pres = new xmppClient.Element(
                'presence', {
                    to: config.roomId + '@' + config.rtcServer.replace('xmpp', 'conference') + '/' +
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

        pres.c('user-agent', { 'xmlns': 'http://jitsi.org/jitmeet/user-agent' }).t(this.userAgent);
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
            'event': config.eventType,
            'host': this.server,
            'roomtoken': config.roomtoken,
            'roomtokenexpirytime': config.roomtokenexpirytime,
            'userdata': config.userData,
        }).up();

        if (this.client)
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

    logger.log(logger.level.INFO, "RtcXmpp", "sendPresenceAlive : roomId: " + config.roomId + " eventType : " + config.eventType);

    var self = this;

    // Stop the ping timer
    // this.stopPing();

    // Join the room by sending the presence
    var pres = new xmppClient.Element(
        'presence', {
            to: config.roomId + '@' + config.rtcServer.replace('xmpp', 'conference') + '/' +
                this.jid + '/' + this.xmppJid.resource,
            id: 'c2p1'
        });

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
        'event': config.eventType,
        'host': this.server,
        'type': 'periodic'
    }).up();

    // Start a timer to send presence at interval
    this.prestimer[config.roomId] = setInterval(function() {
        if (self.client)
            self.client.send(pres.tree());
    }, Rtcconfig.json.presInterval);
}

// Method to send presence alive
//
// @param None
// @returns {retValue} 0 on success, negative value on error
//
RtcXmpp.prototype.stopPresenceAlive = function stopPresenceAlive(roomid) {
    logger.log(logger.level.INFO, "RtcXmpp", "stopPresenceAlive :: " + roomid);
    if (!roomid) {
        logger.log(logger.level.INFO, "RtcXmpp", "stopPresenceAlive :: Clear all periodic presence intervals");
        for (var member in this.prestimer) {
            logger.log(logger.level.INFO, "RtcXmpp", "stopPresenceAlive :: Clearing interval for roomid : " + member);
            clearInterval(this.prestimer[member]);
            delete this.prestimer[member];
        }
    } else {
        // Stop the presence timer
        logger.log(logger.level.INFO, "RtcXmpp", "stopPresenceAlive :: Clearing interval for roomid : " + roomid);
        clearInterval(this.prestimer[roomid]);
        delete this.prestimer[roomid];
    }
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
        });

    // Create a variable for SDP
    var localSDP = new SDP(data.sdp);

    this.index++;

    // get the xmpp element
    accept = localSDP.toJingle(accept, 'responder');

    accept.c('data', {
        'xmlns': "urn:xmpp:comcast:info",
        'traceid': data.traceId,
        'host': this.server
    }).up();

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
                to: data.roomId + '@' + data.rtcServer.replace('xmpp', 'conference') + '/' +
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
        });

    this.index++;
    // Create a variable for SDP
    var localSDP = new SDP(data.sdp);

    // get the xmpp element
    initiate = localSDP.toJingle(initiate, 'initiator', self.localStream);

    initiate = initiate.c('data', {
        'xmlns': "urn:xmpp:comcast:info",
        'traceid': data.traceId,
        'host': this.server
    }).up();

    // Send the session-initiate
    this.client.send(initiate.tree());
}

RtcXmpp.prototype.sendSessionTerminate = function(data) {
    logger.log(logger.level.VERBOSE, "RtcXmpp",
        " sendSessionTerminate, to " + data.to);

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
        });

    this.index++;

    var localSDP = new SDP(data.sdp);

    // Create the transport element
    for (var mid = 0; mid < localSDP.media.length; mid++) {
        var cands = data.candidates.filter(function(el) { return el.sdpMLineIndex == mid; });
        var mline = SDPUtil.parse_mline(localSDP.media[mid].split('\r\n')[0]);
        if (cands.length > 0) {
            var ice = SDPUtil.iceparams(localSDP.media[mid], localSDP.session);
            ice.xmlns = 'urn:xmpp:jingle:transports:ice-udp:1';
            transportinfo = transportinfo.c('content', {
                "creator": data.type,
                "name": (cands[0].sdpMid ? cands[0].sdpMid : mline.media)
            }).c('transport', ice);
            for (var i = 0; i < cands.length; i++) {
                transportinfo.c('candidate', SDPUtil.candidateToJingle(cands[i].candidate));
            }
            // add fingerprint
            var fingerprint_line = SDPUtil.find_line(localSDP.media[mid], 'a=fingerprint:', localSDP.session);
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
    transportinfo = transportinfo.up(); // jingle
    transportinfo = transportinfo.c('data', {
        'xmlns': "urn:xmpp:comcast:info",
        'traceid': data.traceId,
        'host': this.server
    }).up();


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

    // Add data element
    caps.c('data', {
        'xmlns': "urn:xmpp:comcast:info",
        'traceid': data.traceId,
        'host': this.server
    });
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
        'event': data.eventType,
        'host': this.server,
        "traceid": data.traceId,
        "roomId": data.roomId,
        "roomtoken": data.roomtoken,
        "roomtokenexpirytime": data.roomtokenexpirytime
    };
    this.requestCapabilities(data_);

    // Join the room by sending the presence
    var allocate = new xmppClient.Element(
            'iq', { to: data.rtcServer.replace('xmpp', 'focus'), "type": "set", id: this.index.toString() + ':sendIQ' })
        .c('conference', {
            'xmlns': 'http://jitsi.org/protocol/focus',
            'room': data.roomId + '@' + data.rtcServer.replace('xmpp', 'conference'),
            'machine-uid': sid()
        }).up();

    this.index++;

    // Go to child "conference"
    conference = allocate.getChild("conference");

    // Add properties
    //  conference.c('property', { "name": "bridge", "value": "jitsi-videobridge." + data.rtcServer });
    //  conference.c('property', { "name": "call_control", "value": data.rtcServer.replace('xmpp', 'callcontrol') });
    conference.c('property', { "name": "channelLastN", "value": data.channelLastN ? data.channelLastN : "-1" });
    conference.c('property', { "name": "adaptiveLastN", "value": "false" });
    // conference.c('property', { "name": "adaptiveSimulcast", "value": "false" });
    // conference.c('property', { "name": "openSctp", "value": "true" });
    conference.c('property', { "name": "enableLipSync", "value": "true" })
        //    conference.c('property', { "name": "enableFirefoxHacks", "value": "false" });
    conference.c('property', { "name": "simulcastMode", "value": "rewriting" });

    var dataElem = {
        'xmlns': "urn:xmpp:comcast:info",
        'traceid': data.traceId,
        'childnodeid': data.childNodeId,
        'rootnodeid': data.rootNodeId,
        'event': data.eventType,
        'host': this.server,
        'roomtoken': data.roomtoken,
        'roomtokenexpirytime': data.roomtokenexpirytime,
        'userdata': data.userData,

    }

    if (data.useAnonymousLogin && data.isRoomModerated) {
        dataElem.type = "allocate";
    }

    if (data.sessionType == "upgrade" || data.sessionType == "downgrade") {
        if (data.eventType == 'groupchat') {
            dataElem.type = "deallocate";
            var self = this;
            self.sessionStore[config.roomId] = "groupchat";
            if (self.disconnectWS) {

                var sessionFlag = false;
                Object.keys(self.sessionStore).forEach(function(element) {
                    if (self.sessionStore[element] !== "groupchat") {
                        sessionFlag = true;
                    }
                });
                if (sessionFlag == false) {
                    Object.keys(self.sessionStore).forEach(function(element) {
                        self.emit(element, "onDisconnectIQ");
                    });
                }

            }
        } else {
            dataElem.type = "allocate";
        }
    }

    // Add data element
    allocate.c('data', dataElem);

    this.client.send(allocate.tree());
}

// <?xml version="1.0"?>
// <iq id="lx4013" type="set" from="<jid>" to="pr-focus-as-b-001.rtc.sys.comcast.net">
//     <query xmlns="jabber:iq:private" strict="false">
//         <data xmlns="urn:xmpp:comcast:info" type="allocate" traceid="<traceId>" roomid="<roomId>"  />
//     </query>
// </iq>
//
// <?xml version="1.0"?>
// <iq id="lx4013" type="set" from="<jid>" to="pr-focus-as-b-001.rtc.sys.comcast.net">
//     <query xmlns="jabber:iq:private" strict="false">
//         <data xmlns="urn:xmpp:comcast:info" type="deallocate" traceid="<traceId>" roomid="<roomId>"    />
//     </query>
// </iq>
/**
 * Example for sending private iq messages
 * @private
 */
RtcXmpp.prototype.sendPrivateAllocate = function(data) {

    logger.log(logger.level.INFO, "RtcXmpp",
        " sendPrivateAllocate " + data);

    var privateIq = new xmppClient.Element(
            'iq', {
                id: this.index.toString() + ':sendIQ',
                to: data.rtcServer.replace('xmpp', 'focus'),
                "type": "set",
                from: this.jid + '/' + this.xmppJid.resource
            })
        .c('query', {
            'xmlns': 'jabber:iq:private',
            'strict': false,
        }).up();

    query = privateIq.getChild("query");

    // Add data element
    query.c('data', {
        'xmlns': "urn:xmpp:comcast:info",
        'type': "allocate",
        'roomid': data.roomId,
        'traceid': data.traceId,
        'event': data.eventType,
        'host': this.server,
    });

    this.client.send(privateIq.tree());

};
// Method to send reject call
//
// @param {data} - Configuration 
// @returns {retValue} 0 on success, negative value on error
//
RtcXmpp.prototype.sendRejectIQ = function(data) {

    logger.log(logger.level.VERBOSE, "RtcXmpp",
        " sendRejectIQ " + data);

    var privateIq = new xmppClient.Element(
        'iq', {
            id: this.index.toString() + ':sendIQ',
            "type": "set",
            to: data.roomId + '@' + data.rtcserver.replace("xmpp", "callcontrol") + '/' + this.jid

        }).c('query', {
        'xmlns': 'jabber:iq:private',
        'strict': false,
    }).up();

    // Add data element
    privateIq.c('data', {
        "action": "reject",
        'xmlns': "urn:xmpp:comcast:info",
        'roomid': data.roomId,
        'traceid': data.traceId,
        'event': "pstncall",
        "rtcserver": data.rtcserver,
        "to": data.roomId + '@' + data.rtcserver.replace("xmpp", "callcontrol") + '/' + this.jid
    });

    this.client.send(privateIq.tree());
};
// Method to send rayo command
//
// @param {data} - Configuration 
// @returns {retValue} 0 on success, negative value on error
//
RtcXmpp.prototype.sendRayo = function sendRayo(data) {

    logger.log(logger.level.VERBOSE, "RtcXmpp",
        " sendRayo, to " + data.toTN);

    // Join the room by sending the presence
    var rayo = new xmppClient.Element(
            'iq', { to: data.focusJid, "type": "set", id: this.index.toString() + ':sendIQ' })
        .c('dial', {
            'xmlns': 'urn:xmpp:rayo:1',
            'to': data.toTN,
            'from': data.fromTN
        })
        .c('header', { 'name': 'JvbRoomName', "value": data.roomId + '@' + data.rtcServer.replace('xmpp', 'conference') }).up().up();


    var dataElem = {
        xmlns: 'urn:xmpp:comcast:info',
        event: data.eventType,
        traceid: data.traceId,
        rootnodeid: data.rootNodeId,
        childnodeid: data.childNodeId,
        host: this.server,
        toroutingid: data.toRoutingId,
        roomtoken: data.roomtoken,
        roomtokenexpirytime: data.roomtokenexpirytime
    }

    if (data.toDomain) {
        dataElem.todomain = data.toDomain;
    }

    rayo.c('data', dataElem).up();

    this.index++;
    // send the rayo command
    this.client.send(rayo.tree());
}

// Method to send Hangup command
//
// @param {data} - Configuration
// @returns {retValue} 0 on success, negative value on error
//
RtcXmpp.prototype.sendHangup = function sendHangup(config, participantJid) {
    logger.log(logger.level.VERBOSE, "RtcXmpp",
        " sendHangup");

    var roomJid = config.roomId + '@' + config.rtcServer.replace('xmpp', 'callcontrol');

    // Join the room by sending the presence
    var hangup = new xmppClient.Element(
            'iq', { to: roomJid + "/" + participantJid, "type": "set", id: this.index.toString() + ':sendIQ' })
        .c('hangup', { 'xmlns': 'urn:xmpp:rayo:1' }).up();

    hangup = hangup.c('data', {
        'xmlns': "urn:xmpp:comcast:info",
        'traceid': config.traceId,
        'host': this.server
    }).up();

    this.index++;
    // send the rayo command
    this.client.send(hangup.tree());
}

/**
 * Method to send private iq to hold
 */
RtcXmpp.prototype.sendMessageHold = function(config, participantJid, hold) {

    logger.log(logger.level.VERBOSE, "RtcXmpp",
        " sendMessageHold ");

    this.index++;

    var roomJid = config.roomId + '@' + config.rtcServer.replace('xmpp', 'conference');

    var holdIQ = new xmppClient.Element(
            'message', {
                id: 'pstnHold',
                from: this.jid + '/' + this.xmppJid.resource,
                to: roomJid + "/" + participantJid,
                type: 'chat',
            })
        .c('body').t(hold ? "hold" : "unhold").up();

    holdIQ = holdIQ.c('data', {
        'xmlns': "urn:xmpp:comcast:info",
        'traceid': config.traceId,
        'host': this.server,
        'roomid': config.roomId
    }).up();

    // send the hold/unhold private message
    this.client.send(holdIQ.tree());

}


// Method to send Hold command
//
// @param {data} - Configuration
// @returns {retValue} 0 on success, negative value on error
//
RtcXmpp.prototype.sendHold = function sendHold(config, participantJid) {
    logger.log(logger.level.VERBOSE, "RtcXmpp", " sendHold");

    var roomJid = config.roomId + '@' + config.rtcServer.replace('xmpp', 'callcontrol');

    // Join the room by sending the presence
    var hold = new xmppClient.Element(
            'iq', { to: roomJid + "/" + participantJid, from: this.jid + '/' + this.xmppJid.resource, "type": "set", id: this.index.toString() + ':sendIQ' })
        .c('hold', { 'xmlns': 'urn:xmpp:rayo:1' }).up();

    hold = hold.c('data', {
        'xmlns': "urn:xmpp:comcast:info",
        'traceid': config.traceId,
        'host': this.server
    }).up();

    this.index++;
    // send the rayo command
    this.client.send(hold.tree());
}

// Method to send UnHold command
//
// @param {data} - Configuration
// @returns {retValue} 0 on success, negative value on error
//
RtcXmpp.prototype.sendUnHold = function sendUnHold(config, participantJid) {
    logger.log(logger.level.VERBOSE, "RtcXmpp", " sendUnHold");

    var roomJid = config.roomId + '@' + config.rtcServer.replace('xmpp', 'callcontrol');

    // Join the room by sending the presence
    var unhold = new xmppClient.Element(
            'iq', { to: roomJid + "/" + participantJid, from: this.jid + '/' + this.xmppJid.resource, "type": "set", id: this.index.toString() + ':sendIQ' })
        .c('unhold', { 'xmlns': 'urn:xmpp:rayo:1' }).up();

    unhold = unhold.c('data', {
        'xmlns': "urn:xmpp:comcast:info",
        'traceid': config.traceId,
        'host': this.server
    }).up();

    this.index++;
    // send the rayo command
    this.client.send(unhold.tree());
}

// Method to send merge command
//
// @param {data} - Configuration
//
RtcXmpp.prototype.sendMerge = function sendMerge(config, firstParticipantJid, secondParticipantJid) {

    logger.log(logger.level.VERBOSE, "RtcXmpp", " sendMerge");

    var roomJid = config.roomId + '@' + config.rtcServer.replace('xmpp', 'callcontrol');

    var merge = new xmppClient.Element(
            'iq', { to: roomJid + "/" + firstParticipantJid, from: this.jid + '/' + this.xmppJid.resource, "type": "set", id: this.index.toString() + ':sendIQ' })
        .c('merge', { 'xmlns': 'urn:xmpp:rayo:1' })
        .c('header', { "name": "secondParticipant", "value": secondParticipantJid }).up().up();

    merge = merge.c('data', {
        'xmlns': "urn:xmpp:comcast:info",
        'traceid': config.traceId,
        'host': this.server
    }).up();

    this.index++;
    // send the rayo command
    this.client.send(merge.tree());
}

// Method to send callStats through websocket
//
// @param {data} - Configuration
// @returns {retValue} 0 on success, negative value on error
//
RtcXmpp.prototype.sendCallStats = function(data) {

    var self = this;

    const workFunction = finishedCallback => {
        logger.log(logger.level.INFO, "RtcXmpp",
            " sendCallStats : " + data.stats.n);

        var privateIq = new xmppClient.Element(
                'iq', {
                    id: this.index.toString() + ':sendStatsIQ',
                    "type": "set",

                })
            .c('query', {
                'xmlns': 'jabber:iq:private',
                'strict': false,
            }).up();
        // var myString = JSON.stringify(data.stats);
        // myString = myString.replace(/\"/g, "");
        // Add data element
        privateIq.c('data', {
            'xmlns': "urn:xmpp:comcast:info",
            'stats': JSON.stringify(data.stats),
            'roomid': data.roomId,
            'traceid': data.traceId,
            'event': "callstats",
            'action': "log"

        });

        this.index++;

        if (this.client) {
            this.client.send(privateIq.tree());
            self.sendMessageQueue.pause()
            finishedCallback();
        }
    }

    self.sendMessageQueue.push(workFunction);

}

/**
 * 
 * @param {json} config - Config from session
 * @param {string} participantJid - Jid of the participant to be kicked
 * @param {string} participantName - Name of the participant
 */
RtcXmpp.prototype.kickParticipant = function(config, participantJid, participantName) {

    logger.log(logger.level.VERBOSE, "RtcXmpp",
        " kickParticipant :: " + participantJid);

    var kick = new xmppClient.Element(
            'iq', {
                id: this.index.toString() + ':sendIQ',
                from: this.jid + '/' + this.xmppJid.resource,
                to: config.roomId + '@' + config.rtcServer.replace('xmpp', 'conference'),
                type: 'set',
            })
        .c('query', {
            'xmlns': 'http://jabber.org/protocol/muc#admin',
        })
        .c('item', { 'nick': participantJid, 'role': 'none' })
        .c('reason').t("Ohh Sorry!! You are kicked out of room").up().up().up()

    kick.c('data', {
        'xmlns': "urn:xmpp:comcast:info",
        'traceid': config.traceId,
        'host': this.server
    });

    this.index++;
    // Send kick iq to a participant
    this.client.send(kick.tree());
}

/**
 * Call this API to a lock a room
 * @param {json} config - User config from session
 */
RtcXmpp.prototype.lockRoom = function(config) {

    logger.log(logger.level.VERBOSE, "RtcXmpp",
        " lockRoom :: " + config.roomId);

    var lockRoom = new xmppClient.Element(
            'iq', {
                id: this.index.toString() + ':sendIQ',
                from: this.jid + '/' + this.xmppJid.resource,
                to: config.roomId + '@' + config.rtcServer.replace('xmpp', 'conference'),
                type: 'set',
            })
        .c('query', {
            'xmlns': 'http://jabber.org/protocol/muc#admin',
        })
        .c('item', { 'lock': true, 'rejoin': config.rejoin ? config.rejoin : false }).up().up()

    lockRoom.c('data', {
        'xmlns': "urn:xmpp:comcast:info",
        'traceid': config.traceId,
        'host': this.server
    });

    this.index++;
    // Send lockRoom iq to a participant
    this.client.send(lockRoom.tree());
}

/**
 * Call this API to unlock the room
 * @param {json} config - User config from sessiom
 */
RtcXmpp.prototype.unlockRoom = function(config) {

    logger.log(logger.level.VERBOSE, "RtcXmpp",
        " unlockRoom :: " + config.roomId);

    var unlockRoom = new xmppClient.Element(
            'iq', {
                id: this.index.toString() + ':sendIQ',
                from: this.jid + '/' + this.xmppJid.resource,
                to: config.roomId + '@' + config.rtcServer.replace('xmpp', 'conference'),
                type: 'set',
            })
        .c('query', {
            'xmlns': 'http://jabber.org/protocol/muc#admin',
        })
        .c('item', { 'lock': false }).up().up()

    unlockRoom.c('data', {
        'xmlns': "urn:xmpp:comcast:info",
        'traceid': config.traceId,
        'host': this.server
    });

    this.index++;
    // Send unlockRoom iq to a participant
    this.client.send(unlockRoom.tree());
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
        })

    // Check if new ssrcs are available to send source-add
    var isNewSsrc = sdpDiffer.toJingle(add, true, this.xmppJid.toString());

    add = add.up();

    add = add.c('data', {
        'xmlns': "urn:xmpp:comcast:info",
        'traceid': data.traceId,
        'host': this.server
    }).up();

    if (isNewSsrc) {

        logger.log(logger.level.INFO, "RtcXmpp",
            " sendSourceAdd ");

        this.index++;

        // Send the source-add
        this.client.send(add.tree());
    }
}

/**
 * 
 * @param {json} config - Config from session
 * @param {string} participantJid - Jid of the participant to be made as moderator
 * @param {string} participantName - Name of the participant
 */
RtcXmpp.prototype.grantModeratorPrivilege = function(config, participantJid) {

    logger.log(logger.level.VERBOSE, "RtcXmpp",
        " grantModeratorPrivilege :: " + participantJid);

    var moderator = new xmppClient.Element(
            'iq', {
                id: this.index.toString() + ':sendIQ',
                from: this.jid + '/' + this.xmppJid.resource,
                to: config.roomId + '@' + config.rtcServer.replace('xmpp', 'conference'),
                type: 'set',
            })
        .c('query', {
            'xmlns': 'http://jabber.org/protocol/muc#admin',
        })
        .c('item', { 'nick': participantJid, 'role': 'moderator' }).up().up()

    moderator.c('data', {
        'xmlns': "urn:xmpp:comcast:info",
        'traceid': config.traceId,
        'host': this.server
    });

    this.index++;
    // Send kick iq to a participant
    this.client.send(moderator.tree());
}


/**
 * 
 * @param {json} config - Config from session
 * @param {string} participantJid - Jid of the participant whose moderator rights being revoked
 * @param {string} participantName - Name of the participant
 */
RtcXmpp.prototype.revokeModeratorPrivilege = function(config, participantJid) {

    logger.log(logger.level.VERBOSE, "RtcXmpp",
        " revokeModeratorPrivilege :: " + participantJid);

    var moderator = new xmppClient.Element(
            'iq', {
                id: this.index.toString() + ':sendIQ',
                from: this.jid + '/' + this.xmppJid.resource,
                to: config.roomId + '@' + config.rtcServer.replace('xmpp', 'conference'),
                type: 'set',
            })
        .c('query', {
            'xmlns': 'http://jabber.org/protocol/muc#admin',
        })
        .c('item', { 'nick': participantJid, 'role': 'participant' }).up().up()

    moderator.c('data', {
        'xmlns': "urn:xmpp:comcast:info",
        'traceid': config.traceId,
        'host': this.server
    });

    this.index++;
    // Send kick iq to a participant
    this.client.send(moderator.tree());
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
        });

    // get the xmpp element
    sdpDiffer.toJingle(remove, false, this.xmppJid.toString());

    remove = remove.up();

    remove = remove.c('data', {
        'xmlns': "urn:xmpp:comcast:info",
        'traceid': data.traceId,
        'host': this.server
    }).up();


    this.index++;

    // Send the session-initiate
    this.client.send(remove.tree());
}

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

// Callback to get the stanza from xmpp
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

// Callback to parse XMPP IQ
//
// @param {msg} stanza
// @returns Nothing
//
RtcXmpp.prototype._onIQ = function _onIQ(stanza) {

    var self = this;

    // CHeck if this is a jingle message
    if (stanza.getChild('jingle')) {
        this._onJingle(stanza);
    } else if (stanza.getChild('query', "http://jabber.org/protocol/disco#info")) {
        this._onDiscoInfo(stanza);
    } else if (stanza.getChild('query', "jabber:iq:private")) {
        this._onPrivateIQ(stanza);
    } else if (stanza.getChild('ref')) {
        this._onRayoIQ(stanza);
    } else if (stanza && stanza.attrs && stanza.attrs.id == 'c2s1') {

        self.isAlive = true;

        //If we get reply for the last try in ping counter clear the timeout
        if (self.pingLocalCounter == Rtcconfig.json.pingCounter) {
            logger.log(logger.level.INFO, "RtcXmpp", " Got ping reply for last try in pingCounter clearing the timeout");
            clearTimeout(self.pingexpiredtimer);
        }
        self.pingLocalCounter = 0;
    }



    if (stanza.attrs && stanza.attrs.type == "result") {

        if (stanza.id.includes('sendStatsIQ')) {

            self.sendMessageQueue.resume();

        } else if (stanza.getChild("conference")) {

            this._onConference(stanza);

        }
    }


    // Check if this is ack from focus
    // if (stanza.attrs && stanza.attrs.type == "result" &&
    //     stanza.getChild("conference")) {

    //     this._onConference(stanza);

    // }

    // Check if this is ack from focus
    if (stanza.attrs && stanza.attrs.type == "error") {
        var discoCheck = JSON.stringify(stanza);

        var roomId = "Error";
        if (stanza.attrs && stanza.attrs.from) {
            roomId = stanza.attrs.from.split('@')[0];
        }

        if (discoCheck.search("disco#info") == -1) {
            var error = stanza.getChild('error');
            if (error && error.getChild('text') && error.getChild('text').getText()) {
                var errorText = error.getChild('text').getText();
                this.emit(roomId, 'onIQError', { "error": errorText, "roomId": roomId });
            }
            this.emit(roomId, 'onIQError', { "error": "Error in IQ", "roomId": roomId });
        }
    }
}

// Callback to parse XMPP IQ
//
// @param {msg} stanza
// @returns Nothing
//
RtcXmpp.prototype._onConference = function _onConference(stanza) {

    // Check if it was a success
    var conf = stanza.getChild("conference");

    // Get focus jid
    if (conf.attrs.focusjid) {
        var roomId = conf.attrs.room.split("@")[0];

        var data = { "focusJid": conf.attrs.focusjid, "roomId": roomId };

        this.emit(roomId, 'onAllocateSuccess', data);
    }

}

// Callback to parse XMPP IQ
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
    var roomId = "";
    roomId = stanza.attrs.from ? stanza.attrs.from.split('@')[0] : "NA";

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

        ack.c('data', {
            'xmlns': "urn:xmpp:comcast:info",
            'host': this.server,
        }).up();

        // send ack
        this.client.send(ack.tree());

        // Create a variable for SDP
        var remoteSDP = new SDP('');

        // Convert to SDP
        remoteSDP.fromJingle(stanza);

        // Create the json for session
        var data = {
            "remoteSDP": remoteSDP,
            "jingle": jingle,
            "sdp": remoteSDP.raw,
            "roomId": roomId,
            "from": fromJid
        };

        // send the presence message
        this.emit(roomId, 'onSessionInitiate', data);
    } else if (jingle.attrs.action === "session-accept") {
        // Parse session-initiate and convert it to sdp
        // Send ack first
        var ack = new xmppClient.Element('iq', {
            type: 'result',
            to: stanza.attrs.from,
            id: stanza.id,
            from: stanza.attrs.to
        });

        ack.c('data', {
            'xmlns': "urn:xmpp:comcast:info",
            'host': this.server,
        }).up();

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
            "roomId": roomId,
            "from": stanza.attrs.from
        };
        var self = this;
        process.nextTick(function() {
            // send the presence message
            self.emit(roomId, 'onSessionAccept', data);
        });
    } else if (jingle.attrs.action === "source-add") {
        // Send ack first
        var ack = new xmppClient.Element('iq', {
            type: 'result',
            to: stanza.attrs.from,
            id: stanza.id,
            from: stanza.attrs.to
        });

        ack.c('data', {
            'xmlns': "urn:xmpp:comcast:info",
            'host': this.server,
        }).up();

        // send ack
        this.client.send(ack.tree());

        // Create the json for session
        var data = {
            "jingle": jingle,
            "roomId": roomId,
            "from": stanza.attrs.from
        };
        var self = this;
        process.nextTick(function() {
            // send the presence message
            self.emit(roomId, 'onSourceAdd', data);
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

        ack.c('data', {
            'xmlns': "urn:xmpp:comcast:info",
            'host': this.server,
        }).up();

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
                    "roomId": roomId,
                    "from": stanza.attrs.from
                };

                process.nextTick(function() {
                    // send the candidate message
                    self.emit(roomId, 'onCandidate', data);
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

        ack.c('data', {
            'xmlns': "urn:xmpp:comcast:info",
            'host': this.server,
        }).up();

        // send ack
        this.client.send(ack.tree());

        // Create the json for session
        var data = {
            "jingle": jingle,
            "roomId": roomId,
            "from": stanza.attrs.from
        };
        var self = this;
        process.nextTick(function() {
            // send the presence message
            self.emit(roomId, 'onSourceRemove', data);
        });
    } else {
        logger.log(logger.level.INFO, "RtcXmpp.onMessage", "New action item found in jingle: " + jingle.attrs.action);
    }
}

function getVal(stanza, child) {
    if (stanza.getChild(child)) {
        return stanza.getChild(child).getText();
    }
}


// Callback to get the stanza from xmpp
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

        var roomId = stanza.attrs.from.split('@')[0];

        self.emit(roomId, 'onPresenceError', { "error": stanza.children, "roomId": roomId });
        return;
    }

    // Get the x node
    var x = stanza.getChild('x', 'http://jabber.org/protocol/muc#user');
    if (!x) { return; }

    var dataElement = stanza.getChild('data');
    dataElement = dataElement ? dataElement.attrs : dataElement;

    logger.log(logger.level.VERBOSE, "RtcXmpp.onMessage", "onPresence :: dataElement " + JSON.stringify(dataElement));

    // Retrieve item node
    var item = x.getChild('item');

    // Check if the item
    if (item) {

        logger.log(logger.level.VERBOSE, "RtcXmpp.onMessage",
            " item " + JSON.stringify(item.attrs));

        var roomId = stanza.attrs.from.split('@')[0];
        // Check if someone is leaving the room
        if (stanza.attrs && stanza.attrs.type && stanza.attrs.type) {
            var fromField = stanza.attrs.from.substring(stanza.attrs.from.indexOf('/') + 1);

            // Create the presence config
            var presenceConfig = {
                "jid": fromField,
                "role": item.attrs.role,
                "affiliation": item.attrs.affiliation,
                "roomId": roomId,
                "type": stanza.attrs.type,
                "from": stanza.attrs.from,
                "dataElement": dataElement
            };


            var reason = item.getChild('reason');
            if (reason && reason.children && reason.children[0]) {
                reason = reason.children[0];
                presenceConfig.reason = reason;
            }

            // send the presence message
            self.emit(roomId, 'onPresence', presenceConfig);

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
                "roomId": roomId,
                "type": "join",
                "from": stanza.attrs.from,
                "videomuted": videomuted,
                "audiomuted": audiomuted,
                "nick": nick,
                "status": status,
                "dataElement": dataElement

            };
            // send the presence message
            self.emit(roomId, 'onPresence', presenceConfig);
        }
    }
}

// Callback to parse XMPP PRIVATE IQ
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

            var roomId = stanza.attrs.from.split('@')[0];

            var data = {
                from: stanza.attrs.from,
                id: stanza.attrs.id,
                roomId: roomId
            };

            // send the presence message
            self.emit(roomId, 'onCapabilityRequest', data);

        } else if (stanza.attrs.type == "result") {
            logger.log(logger.level.INFO, "RtcXmpp._onDiscoInfo",
                " Received capabilities, not doing anything with it");
        }
    } else {
        logger.log(logger.level.ERROR, "RtcXmpp._onDiscoInfo",
            " Received disco info error");
    }
}


// Callback to parse XMPP PRIVATE IQ
//
// @param {msg} stanza
// @returns Nothing
//
RtcXmpp.prototype._onPrivateIQ = function _onPrivateIQ(stanza) {
    logger.log(logger.level.VERBOSE, "RtcXmpp._onPrivateIQ", "Stanza " + stanza);
    var self = this;

    // Get the query node
    var privateiq = stanza.getChild('query');
    if (!privateiq) { return; }

    // Retrieve data node
    var data = privateiq.getChild('data');

    // Check if the data is avaialable
    if (data) {

        // Check if it has required config
        // if (!data.attrs.roomid || !data.attrs.routingid) {
        //     logger.log(logger.level.ERROR, "RtcXmpp._onPrivateIQ",
        //         "Ignoring private IQ as it doesnt have correct parameters");
        //     return;
        // }

        if (data.attrs.type) {

            if (data.attrs.type == "disconnect") {

                logger.log(logger.level.INFO, "RtcXmpp._onPrivateIQ", "Disconnect WebSocket connection")
                if (Object.keys(self.prestimer).length == 0) {
                    //end connection
                    self.disconnect();
                } else {
                    self.disconnectWS = true;
                    var sessionFlag = false;
                    Object.keys(self.sessionStore).forEach(function(element) {
                        if (self.sessionStore[element] !== "groupchat") {
                            sessionFlag = true;
                        }
                    });
                    if (sessionFlag == false) {
                        Object.keys(self.sessionStore).forEach(function(element) {
                            self.emit(element, "onDisconnectIQ");
                        });
                    }
                    // self.emit(Object.keys(self.prestimer)[0], "onDisconnectIQ");

                }

            } else if (data.attrs.type == 'leave room') {
                self.emit(data.attrs.roomid, 'leaveRoom');
            } else if (data.attrs.type == 'notify' || data.attrs.type == 'cancel' || data.attrs.type == 'chat') {

                var incomingConfig = {
                    "roomId": data.attrs.roomid,
                    "action": data.attrs.action,
                    "routingId": data.attrs.routingid,
                    "rtcserver": data.attrs.rtcserver,
                    "traceId": data.attrs.traceid,
                    "userdata": data.attrs.userdata,
                    "roomtoken": data.attrs.roomtoken,
                    "roomtokenexpirytime": data.attrs.roomtokenexpirytime,
                    "type": data.attrs.type
                };

                var roomIdListenerCount = self.listenerCount(incomingConfig.roomId);

                if ((incomingConfig.type == 'notify') ||
                    ((incomingConfig.type == 'cancel' || incomingConfig.type == 'chat') && roomIdListenerCount == 0)) {
                    self.emit('onIncoming', incomingConfig);
                } else {
                    logger.log(logger.level.INFO, "RtcXmpp._onPrivateIQ", "Notification type is " + incomingConfig.type)
                }
            } else {
                logger.log(logger.level.INFO, "RtcXmpp._onPrivateIQ", "Private IQ type is " + data.attrs.type)
            }

        } else {
            logger.log(logger.level.INFO, "RtcXmpp._onPrivateIQ", "Private IQ is received")
        }

    } else {
        logger.log(logger.level.ERROR, "RtcXmpp._onPrivateIQ",
            " Received privateiq error");
    }
}

// Callback to parse XMPP RAYO IQ RESULT
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

// Callback to parse XMPP chat messages
//
// @param {stanza} stanza
// @returns Nothing
//
RtcXmpp.prototype._onChatMessage = function(stanza) {

    logger.log(logger.level.VERBOSE, "RtcXmpp",
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

// Callback to parse XMPP chat messages to mute/unmute video
//
// @param {stanza} stanza
// @returns Nothing
//
RtcXmpp.prototype._onChat = function(stanza) {

    logger.log(logger.level.VERBOSE, "RtcXmpp",
        " _onChat");

    var self = this;
    var from = "";
    var roomId = "";
    if (stanza.attrs.from.includes('conference')) {
        from = stanza.attrs.from.substring(stanza.attrs.from.indexOf('/') + 1);
        roomId = stanza.attrs.from.split('@')[0];
    } else {
        from = stanza.attrs.from;
    }
    // var to = stanza.attrs.to.split('/')[0];
    var to = stanza.attrs.to;
    var id = stanza.attrs.id;
    var data = stanza.getChild('data');
    roomId = data.attrs.roomid;
    var body = stanza.getChild('body');
    if (body) {
        var message = body.getText();
        logger.log(logger.level.INFO, "RtcXmpp",
            " _onChat : message: " + message);
        if (message) {
            //Handle mute/unmute of the particpant
            if (id && id == "mute") {
                if (message == 'mute') {
                    self.emit(roomId, 'onVideoMute', { "mute": true, "roomId": roomId });
                } else if (message == 'unmute') {
                    self.emit(roomId, 'onVideoMute', { "mute": false, "roomId": roomId });
                } else if (message == 'audioMute') {
                    self.emit(roomId, 'onAudioMute', { "mute": true, "roomId": roomId });
                } else if (message == 'audioUnmute') {
                    self.emit(roomId, 'onAudioMute', { "mute": false, "roomId": roomId });
                }
            } else if (id && id == "pstnHold") {

                if (message == "hold")
                    self.emit(roomId, 'onPSTNHold', { 'hold': true, from: from, roomId: roomId });
                else if (message == "unhold")
                    self.emit(roomId, 'onPSTNHold', { 'hold': false, from: from, roomId: roomId });


            } else {
                // For handling chat messages
            }
        }
    }
}


// Callback to parse XMPP group chat messages
//
// @param {stanza} stanza
// @returns Nothing
//
RtcXmpp.prototype._onGroupChat = function(stanza) {

    logger.log(logger.level.VERBOSE, "RtcXmpp",
        " _onGroupChat");

    var self = this;

    var from = "";
    var roomId = "";
    if (stanza.attrs.from.includes('conference')) {
        from = stanza.attrs.from.substring(stanza.attrs.from.indexOf('/') + 1);
        roomId = stanza.attrs.from.split('@')[0];
    } else {
        from = stanza.attrs.from;
    }

    // var from = stanza.attrs.from.split('/')[0];
    // var to = stanza.attrs.to.split('/')[0];
    // var from = stanza.attrs.from;
    var to = stanza.attrs.to;
    var body = stanza.getChild('body');
    var id = stanza.attrs.id;

    if (body) {
        var data = stanza.getChild('data');
        if (!data || !data.attrs || !data.attrs.evmresponsecode) {
            logger.log(logger.level.ERROR, "RtcXmpp", "_onGroupChat : " + " Missing Data element or attributes in data element");
            return;
        }

        var status = parseInt(data.attrs.evmresponsecode);
        var chatAckJson = {}

        //Handle chat ack messages
        if (from == to) {
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
                    roomId: roomId,
                    from: from,
                    statusCode: status,
                    statusMessage: "Failed"
                }
            } else if (200 <= status < 300) {

                var rootNodeId = "";
                var childNodeId = "";
                var timereceived = "";

                if (data.attrs.rootnodeid)
                    rootNodeId = data.attrs.rootnodeid;

                if (data.attrs.childnodeid)
                    childNodeId = data.attrs.childnodeid;

                if (data.attrs.timereceived)
                    timereceived = data.attrs.timereceived;

                chatAckJson = {
                    id: id,
                    roomId: roomId,
                    from: from,
                    rootNodeId: rootNodeId,
                    childNodeId: childNodeId,
                    timeReceived: timereceived,
                    statusCode: status,
                    statusMessage: "Success"
                }
            } else {
                chatAckJson = {
                    id: id,
                    roomId: roomId,
                    statusCode: status,
                    statusMessage: "Error"
                }
            }
            self.emit(roomId, "onChatAck", chatAckJson);

        } else {

            //Handle messages from other participants
            var message = body.getText();
            logger.log(logger.level.INFO, "RtcXmpp",
                " _onGroupChat : message: " + message);
            var rootNodeId = data.attrs.rootnodeid;
            var childNodeId = data.attrs.childnodeid;
            var chatMsg = {
                id: id,
                roomId: roomId,
                from: from,
                message: message,
                rootNodeId: rootNodeId,
                childNodeId: childNodeId,
            }

            if (chatMsg) {
                self.emit(roomId, 'onGroupChatMessage', chatMsg);
            }

            var chatState = "";
            if (stanza.getChild('active')) {
                chatState = "active";
            }

            if (from != to && chatState) {
                logger.log(logger.level.INFO, "RtcXmpp",
                    " _onGroupChat :: from : " + from + " onChatState : " + chatState);

                self.emit(roomId, 'onChatState', { from: from, chatState: chatState, roomId: roomId });
            }
        }
    } else {
        //Handle chat states notifications

        var chatState = "";
        if (stanza.getChild('active')) {
            chatState = "active";
        } else if (stanza.getChild('composing')) {
            chatState = "composing";
        } else if (stanza.getChild('paused')) {
            chatState = "paused";
        } else if (stanza.getChild('inactive')) {
            chatState = "inactive";
        } else if (stanza.getChild('gone')) {
            chatState = "gone";
        }

        if (from != to) {

            logger.log(logger.level.INFO, "RtcXmpp",
                " _onGroupChat :: from : " + from + " onChatState : " + chatState);

            self.emit(roomId, 'onChatState', { from: from, chatState: chatState, roomId: roomId });
        }
    }
}

/**
 * Send Group chat message
 */
RtcXmpp.prototype.sendGroupChatMessage = function(config, id, message, topic) {

    this.index++;

    var data = {
        'xmlns': "urn:xmpp:comcast:info",
        'traceid': config.traceId,
        'host': this.server,
    }

    if (topic)
        data.topic = topic;

    var msg = new xmppClient.Element(
            'message', {
                id: id,
                from: this.jid + '/' + this.xmppJid.resource,
                to: config.roomId + '@' + config.rtcServer.replace('xmpp', 'conference'),
                type: 'groupchat',
            })
        .c('body').t(message).up()
        .c('active', { xmlns: 'http://jabber.org/protocol/chatstates' }).up()
        .c('data', data).up();

    if (this.client)
        this.client.send(msg.tree());
    else
        logger.log(logger.level.ERROR, "RtcXmpp", "sendGroupChatMessage :: Failed to send group chat")

}

/**
 * Send chat state notifications
 */
RtcXmpp.prototype.sendChatState = function(config, chatState) {

    this.index++;

    var data = {
        'xmlns': "urn:xmpp:comcast:info",
        'traceid': config.traceId,
        'host': this.server,
    }

    chatState = chatState == 'typing' ? 'composing' : chatState;

    var msg = new xmppClient.Element(
            'message', {
                from: this.jid + '/' + this.xmppJid.resource,
                to: config.roomId + '@' + config.rtcServer.replace('xmpp', 'conference'),
                type: 'groupchat',
            })
        .c(chatState, { xmlns: 'http://jabber.org/protocol/chatstates' }).up()
        .c('data', data).up();

    if (this.client)
        this.client.send(msg.tree());
    else
        logger.log(logger.level.ERROR, "RtcXmpp", "sendChatState :: Failed to send chat state")
}

RtcXmpp.prototype.sendVideoMute = function(to, isMute, config) {
    this.index++;
    var mute = new xmppClient.Element(
            'message', {
                id: 'mute',
                from: this.jid + '/' + this.xmppJid.resource,
                to: to,
                type: 'chat',
            })
        .c('body').t(isMute ? "mute" : "unmute").up();

    mute = mute.c('data', {
        'xmlns': "urn:xmpp:comcast:info",
        'traceid': config.traceId,
        'host': this.server,
        'roomid': config.roomId
    }).up();

    // send the mute/unmute private message
    this.client.send(mute.tree());

}

RtcXmpp.prototype.sendAudioMute = function(to, isMute, config) {

    this.index++;
    var mute = new xmppClient.Element(
            'message', {
                id: 'mute',
                from: this.jid + '/' + this.xmppJid.resource,
                to: to,
                type: 'chat',
            })
        .c('body').t(isMute ? "audioMute" : "audioUnmute").up();

    mute = mute.c('data', {
        'xmlns': "urn:xmpp:comcast:info",
        'traceid': config.traceId,
        'host': this.server,
        'roomid': config.roomId
    }).up();

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
