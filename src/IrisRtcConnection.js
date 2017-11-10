// Copyright 2016 Comcast Cable Communications Management, LLC

// IrisRtcConnection.js : Javascript code for establishing connection with backend
//                        The input to the connection is the public id as provided
//                        in the register API.
//

// Defining the API module 
module.exports = IrisRtcConnection;

// Import the modules
var logger = require('./modules/RtcLogger.js');
var RtcErrors = require('./modules/RtcErrors.js').code;
var config = require('./modules/RtcConfig.js');
var https = require('https');
var xmpp = require('./modules/RtcXmpp.js');
var uuidV1 = require('uuid/v1');

var resourceId = null;

if (!resourceId) {
    resourceId = uuidV1(); // Create new timebased uuid
}

// States
["DISCONNECTED", "CONNECTED", "CONNECTING"].forEach(function each(state, index) {
    IrisRtcConnection.prototype[state] = IrisRtcConnection[state] = index;
});

/**
 * Constructor for IrisRtcConnection<br/>
 * This class maintains APIs required for creating and maintaining connection with rtc server.
 * @constructor
 */
function IrisRtcConnection() {
    if (this instanceof IrisRtcConnection === false) {
        throw new TypeError("Classes can't be function-called");
    }

    logger.log(logger.level.INFO, "IrisRtcConnection",
        " Constructor ");

    this.token = null; // Variable to store the JWT token
    this.userID = null; // Variable to store the userid token
    this.xmpptoken = null; // Variable to store xmpp token
    this.xmpptokenExpiry = null; // Variable to store expiry
    this.xmppServer = null; // Variable to store the XMPP server name
    this.traceId = null;
    this.state = IrisRtcConnection.DISCONNECTED;
    this.xmpp = null; // Variable to store instance of websocket connection
    this.type = null;
    this.domain = null;
    this.iceServerJson = null;
    this.myJid = null;
    this.errorDetails = null;
    this.irisUserId = null;
    this.subscriberId = null;
    this.turnCredentialExpiry = null;
    this.isAlive = false;

}

/**
 * This method is called to create a connection with websocket server. It takes routingId of the user and iris token
 * as parameters, this method makes a call to event manager's API <code>/v1/wsturnserverinfo/routingid/:routingid</code>
 * to get <code>websocket_server</code>, <code>websocket_server_token</code>, <code>websocket_server_token_expiry_time</code> and <code>turn_credentials</code> details.<br/>
 *
 * Establishes a web socket connection with the rtc server for the user with routingId.<br/>
 *
 * @param {string} irisToken - Authorisation token or iris token is obtained from Auth manager by providing media token and authentication type 
 * @param {string} routingId - Unique participant Id of user. It is obtained from application server
 * @param {string} eventManagerUrl - Event Manager url to make iris connection
 * @public
 */
IrisRtcConnection.prototype.connect = function(irisToken, routingId, eventManagerUrl) {

    if (!irisToken || !routingId) {
        logger.log(logger.level.ERROR, "IrisRtcConnection", "irisToken and routingId are required to create a connection");

        this.onConnectionError(RtcErrors.ERR_INCORRECT_PARAMETERS, "Invalid parameters")

        return;
    } else {
        logger.log(logger.level.INFO, "IrisRtcConnection",
            " connect :: routingId : " + routingId +
            " irisToken :  <irisToken> " + " eventManagerUrl: " + eventManagerUrl);
    }

    if (this.state == IrisRtcConnection.CONNECTED) {
        logger.log(logger.level.WARNING, "IrisRtcConnection", "Iris Connection exits");
        return;
    }

    if (this.state == IrisRtcConnection.CONNECTING) {
        logger.log(logger.level.WARNING, "IrisRtcConnection", "Connecting... Please wait");
        return;
    }

    var self = this;

    self.userID = routingId;
    self.token = "Bearer " + irisToken;

    this.state = IrisRtcConnection.CONNECTING;

    self._getWSTurnServerInfo(self.token, self.userID, eventManagerUrl);
};

/**
 * API to disconnet from the rtc server connection
 * @public
 */
IrisRtcConnection.prototype.close = function() {
    logger.log(logger.level.INFO, "IrisRtcConnection",
        " close ");

    if (this.xmpp) {
        this.xmpp.removeAllListeners();
        this.xmpp.disconnect();
        this.xmpp = null;
    }

    this.token = null; // Variable to store the JWT token
    this.userID = null; // Variable to store the userid token
    this.xmpptoken = null; // Variable to store xmpp token
    this.xmpptokenExpiry = null; // Variable to store expiry
    this.xmppServer = null; // Variable to store the XMPP server name
    this.traceId = null;
    this.state = IrisRtcConnection.DISCONNECTED;
    this.xmpp = null; // Variable to store instance of websocket connection
    this.type = null;
    this.domain = null;
    this.iceServerJson = null;
    this.myJid = null;
    this.isAlive = false;
};

/**
 * Function to retrieve XMPP server details
 * 
 * @param {string} token for authorization
 * @param {string} Routing id
 * @returns {int} 0 on success, negative value on error
 * @private
 */
IrisRtcConnection.prototype._getWSTurnServerInfo = function(token, routingId, eventManagerUrl) {
    // Error checking
    if (!(config.json.urls.eventManager || eventManagerUrl) ||
        !token ||
        !routingId) {
        logger.log(logger.level.ERROR, "IrisRtcConnection",
            " _getWSTurnServerInfo :: Incorrect parameters : eventManagerUrl  " + eventManagerUrl +
            " config.json.urls.eventManager " + config.json.urls.eventManager);

        this.state = IrisRtcConnection.DISCONNECTED;
        this.isAlive = false;
        this.onConnectionError(RtcErrors.ERR_INCORRECT_PARAMETERS, "Event Manager Url not found")

        return;
    }

    // Options for wsturnserverinfo request
    var options = {
        host: config.json.urls.eventManager ? config.json.urls.eventManager : eventManagerUrl,
        path: '/v1/wsturnserverinfo/routingid/' + routingId,
        method: 'GET',
        headers: { "Authorization": token }
    };

    logger.log(logger.level.VERBOSE, "IrisRtcConnection",
        " _getWSTurnServerInfo :: Getting xmpp server details " +
        " with options " + JSON.stringify(options));

    var self = this;

    // Create a try and catch block
    try {
        // Send the http request and wait for response
        var req = https.request(options, function(response) {
            var body = '';

            // Callback for data
            response.on('data', function(chunk) {
                body += chunk;
            });

            // Callback when complete data is received
            response.on('end', function() {
                logger.log(logger.level.VERBOSE, "IrisRtcConnection",
                    " _getWSTurnServerInfo :: Received server response  " + body);

                // check if the status code is correct
                if (response.statusCode != 200) {
                    logger.log(logger.level.ERROR, "IrisRtcConnection",
                        " _getWSTurnServerInfo :: Getting xmpp server details failed with status code : " +
                        response.statusCode + " & response : " + body);

                    self.state = IrisRtcConnection.DISCONNECTED;
                    self.isAlive = false;
                    self.onConnectionError(RtcErrors.ERR_CREATE_CONNECTION_FAILED, "IrisRtcConnection :: _getWSTurnServerInfo :: Getting xmpp server details failed with status code : " +
                        response.statusCode + " & response : " + body);
                    return;
                }

                // Get the the response json
                var resJson = JSON.parse(body);

                // Check if we have all the data
                if (!resJson.websocket_server || !resJson.websocket_server_token || !resJson.websocket_server_token_expiry_time) {
                    logger.log(logger.level.ERROR, "IrisRtcConnection",
                        " _getWSTurnServerInfo :: Getting xmpp server details failed as didnt receive all the parameters  ");

                    self.state = IrisRtcConnection.DISCONNECTED;
                    self.isAlive = false;
                    self.onConnectionError(RtcErrors.ERR_CREATE_CONNECTION_FAILED, "IrisRtcConnection :: _getWSTurnServerInfo :: Getting xmpp server details failed as didnt receive all the parameters  ");
                    return;
                }

                // Store the data for next time
                if (config.json.wsServer) {
                    self.xmppServer = config.json.wsServer;
                } else {
                    self.xmppServer = resJson.websocket_server;
                }
                self.xmpptoken = resJson.websocket_server_token;
                self.xmpptokenExpiry = resJson.websocket_server_token_expiry_time;

                logger.log(logger.level.VERBOSE, "IrisRtcConnection",
                    " _getWSTurnServerInfo :: Ice server details are  " + resJson.turn_credentials);

                self.iceServerJson = resJson.turn_credentials;

                var json = JSON.parse(self.iceServerJson);
                if (json && json.ttl) {
                    var currTime = (Math.floor(Date.now() / 1000));
                    self.turnCredentialExpiry = currTime + json.ttl;

                    logger.log(logger.level.INFO, "IrisRtcConnection",
                        " _getWSTurnServerInfo : xmpptokenExpiry : " + self.xmpptokenExpiry +
                        " turnCredentialExpiry : " + self.turnCredentialExpiry);
                }

                // XMPP token received, make a call to XMPP server and stay connected
                self._connectXmpp(self.xmpptoken, self.xmppServer, self.xmpptokenExpiry);
            });
        });

        // Catch errors 
        req.on('error', function(e) {
            logger.log(logger.level.ERROR, "IrisRtcConnection",
                " _getWSTurnServerInfo :: Getting xmpp server details failed with error  " + e);

            self.state = IrisRtcConnection.DISCONNECTED;
            self.isAlive = false;
            self.onConnectionError(RtcErrors.ERR_CREATE_CONNECTION_FAILED, "Failed to reach evm");

        });

        // Write json
        req.end();

    } catch (e) {
        logger.log(logger.level.ERROR, "IrisRtcConnection",
            "_getWSTurnServerInfo :: Getting xmpp server details with error  " + e);

        self.state = IrisRtcConnection.DISCONNECTED;
        self.isAlive = false;
        self.onConnectionError(RtcErrors.ERR_CREATE_CONNECTION_FAILED, "Failed to connect");
    }
};

/**
 * Function to connect to XMPP server
 * @param {string} token for xmpp server
 * @param {string} Xmpp server url
 * @returns {int} 0 on success, negative value on error
 * @private
 */
IrisRtcConnection.prototype._connectXmpp = function(xmpptoken, xmppServer, tokenExpiry) {

    logger.log(logger.level.VERBOSE, "IrisRtcConnection",
        " _connectXmpp :: Connecting to Xmpp server at  " + xmppServer +
        " with xmpptoken : " + xmpptoken + " & RoutingId : " + this.userID);

    // Parameter checking
    if (!xmpptoken ||
        !xmppServer) {
        logger.log(logger.level.ERROR, "IrisRtcConnection Connect Xmpp ",
            " Incorrect parameters");

        this.state = IrisRtcConnection.DISCONNECTED;
        this.isAlive = false;
        this.onConnectionError(RtcErrors.ERR_API_PARAMETERS, "Invalid parameters");
        return;
    }

    // Call websocket module for connection
    if (this.xmpp == null) {
        this.xmpp = new xmpp();

        // Assign self
        var self = this;

        // Monitor onopen method
        this.xmpp.on('onOpen', function(jid) {
            logger.log(logger.level.INFO, "IrisRtcConnection",
                " onOpened");
            self.state = IrisRtcConnection.CONNECTED;
            self.isAlive = true;
            self.myJid = jid.toString();
            self.onOpen();
            self.sendEvent("SDK_WebSocketServerConnected", { myJid: self.myJid });
        });

        // Monitor onclose method
        this.xmpp.on('onClose', function() {
            logger.log(logger.level.INFO, "IrisRtcConnection",
                " onClosed");
            self.state = IrisRtcConnection.DISCONNECTED;
            self.isAlive = false;
            self.onClose();
            self.sendEvent("SDK_WebSocketServerDisconnected", { message: "WS connection disconnected" });

        });
        // Monitor onmessage method
        this.xmpp.on('onMessage', function(data, flags) {
            logger.log(logger.level.INFO, "IrisRtcConnection",
                " onMessage " + data);
            self.onMessage(data, flags);
        });

        // Monitor onError method
        this.xmpp.on('onError', function(e) {
            logger.log(logger.level.ERROR, "IrisRtcConnection",
                " onError : " + e);
            self.sendEvent("SDK_IrisRtcConnectionError", e.toString());
            self.state = IrisRtcConnection.DISCONNECTED;
            self.isAlive = false;
            self.onConnectionError(RtcErrors.ERR_API_PARAMETERS, e.toString());
        });

        // Add a listener to incoming to calls
        this.xmpp.on('onIncoming', function(response) {
            logger.log(logger.level.VERBOSE, "IrisRtcConnection",
                " onIncoming " + JSON.stringify(response));
            var userdata = null;
            var config;
            // Check if we have userdata
            if (response.userdata) {
                try {
                    userdata = JSON.parse(response.userdata);
                    logger.log(logger.level.VERBOSE, "IrisRtcConnection",
                        " onIncoming userdata " + JSON.stringify(userdata)
                    );
                } catch (e) {
                    logger.log(logger.level.ERROR, "IrisRtcConnection", " onIncoming JSON parse failed");
                }
            }
            config = response;
            if (userdata)
                config.userdata = userdata;

            logger.log(logger.level.INFO, "IrisRtcConnection", "Notification payload : " + JSON.stringify(config));
            self.onNotification(config);

        });
    }

    //wss://ma-xmpp-as-a-001.rtc.sys.comcast.net/xmpp-websocket/
    //routingid/6b9c6752-d8c5-4d9f-8c2a-c5cf913cb670@share.comcast.net/mucid/28ce36d0-598e-11e6-b9d5-05ba3d7a5b9d/
    //timestamp/1470350578/token/9b458a188213a6b61d492069d1391a29305f799b/traceid/B6903791-690C-4F31-A7D0-5BA77F4B0BA6
    var path = "/xmpp-websocket/routingid/" + this.userID + "/timestamp/" +
        tokenExpiry + "/token/" + this.xmpptoken; //+ "/traceid/" + this.traceId;

    try {
        // Call connect method
        this.xmpp.connect(xmppServer, path, this.userID, resourceId, this.traceId, this.token);

    } catch (error) {
        self.state = IrisRtcConnection.DISCONNECTED;
        self.isAlive = false;
        self.onConnectionError(RtcErrors.ERR_CREATE_CONNECTION_FAILED, error.toString())
    }
};


/**
 * Called when websocket is opened
 * @private
 */
IrisRtcConnection.prototype.onOpen = function() {
    this.onConnected();
};

/**
 * Callback for websocket is disconnection
 * @private
 */
IrisRtcConnection.prototype.onClose = function() {
    // this.onDisconnected();
};

/**
 * Callback for websocket disconnection
 * @public
 */
IrisRtcConnection.prototype.onDisconnected = function() {

}

/**
 * Called when websocket has a message
 * @private
 */
IrisRtcConnection.prototype.onMessage = function(data, flags) {};

/**
 * This callback is called if there are any errors while creating connection
 * @param {integer} errorCode - Error code
 * @param {string} errorMessage - Error message
 * @public
 */
IrisRtcConnection.prototype.onConnectionError = function(errorCode, errorMessage) {

}

/**
 * Called when connection has an event
 * @private
 */
IrisRtcConnection.prototype.sendEvent = function(state, details) {
    var eventdata = { "type": "connection", "state": state, "details": details };
    this.onEvent(eventdata);
};

/**
 * Called when connection has an event
 * @public
 */
IrisRtcConnection.prototype.onEvent = function(event) {

};

/**
 * Called when websocket is connection is established
 * @public
 */
IrisRtcConnection.prototype.onConnected = function() {
    // Same as onOpen
};

/**
 *  Called when websocket has a error
 * @public
 */
IrisRtcConnection.prototype.onConnectionFailed = function(e) {
    // Same as onError
};

/**
 * This callback is called when an incoming call notification is received and
 * notifies client about the incoming call and passes notification information received
 * @param {json} notificationInfo - Notification payload received from the remote participant
 * @param {string} notificationInfo.type - It can be "notify" or "cancel"
 * @param {string} notificationInfo.roomId - Room id to be joined
 * @param {string} notificationInfo.routingId - Routing Id of the user calling
 * @param {string} notificationInfo.roomtoken - Room token
 * @param {string} notificationInfo.roomtokenexpirytime - Room token expiry time
 * @param {string} notificationInfo.traceId - Trace id for the call
 * @param {string} notificationInfo.userdata - user related data
 * @param {string} notificationInfo.userdata.data - User data like cname
 * @param {string} notificationInfo.userdata.data.cname - cname set by the caller
 * @param {string} notificationInfo.userdata.data.cid - Id of the caller
 * @param {string} notificationInfo.userdata.notification - Notification related topic or srcTN
 * @param {string} notificationInfo.userdata.notification.srcTN - Telephone number of caller
 * @param {string} notificationInfo.userdata.notification.topic - Notification topic
 * @public
 */
IrisRtcConnection.prototype.onNotification = function(notificationInfo) {

};
