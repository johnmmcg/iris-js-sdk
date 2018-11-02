// Copyright 2018 Comcast Cable Communications Management, LLC

// RtcRestHelper.js : Javascript code for making rest calls to backend

var https = require('https');
var Rtcconfig = require('../RtcConfig.js');
var logger = require('../RtcLogger.js');

// Defining the API module  
var RtcRestHelper = module.exports;

/**
 * @namespace
 */
RtcRestHelper.EventManager = {

    /**
     * Makes a call to EVM to get RTC server and roomtoken details
     * @param {json} config - Config from session
     * @param {function} successCallback - 
     * @param {function} failureCallback - 
     */
    sendChatMucWithRoomId: function(config, successCallback, failureCallback) {
        try {

            logger.log(logger.level.INFO, "RtcRestHelper.EventManager",
                "sendChatMucWithRoomId called ");

            var options = {
                host: Rtcconfig.json.urls.eventManager,
                path: "/v1.1/xmpp/muc/" + config.roomId + "/credentials",
                method: 'GET',
                headers: {
                    "Authorization": "Bearer " + config.irisToken,
                    "Content-Type": "application/json",
                    "Trace-Id": config.traceId
                }
            };

            var userData = (config.userData && config.eventType != "groupchat") ? config.userData : "";

            logger.log(logger.level.VERBOSE, "RtcRestHelper.EventManager", "sendChatMucWithRoomId :: Ignore userData for groupchat calls");

            logger.log(logger.level.INFO, "RtcRestHelper.EventManager",
                " startmuc with roomid with options " + JSON.stringify(options));

            // Send the http request and wait for response
            var req = https.request(options, function(response) {
                var body = ''

                // Callback for data
                response.on('data', function(chunk) {
                    body += chunk;
                });

                // Callback when complete data is received
                response.on('end', function() {
                    logger.log(logger.level.INFO, "RtcRestHelper.EventManager",
                        " Received server response  " + body);

                    // check if the status code is correct
                    if (response.statusCode != 200 && response.statusCode != 201) {

                        logger.log(logger.level.ERROR, "RtcRestHelper.EventManager",
                            " Start muc with roomid failed with status code  " +
                            response.statusCode + " & response " + body);

                        failureCallback("Start muc with roomid failed with status code  " +
                            response.statusCode + " & response " + body);

                        return;

                    } else {

                        // Get the the response json
                        var resJson = JSON.parse(body);
                        successCallback(resJson);
                    }
                });
            });

            // Catch errors 
            req.on('error', function(e) {

                logger.log(logger.level.ERROR, "RtcRestHelper.EventManager",
                    " Start muc with roomid failed with error  " + e);

                failureCallback("Start muc with roomid failed with error " + e);

            });

            // Write json
            req.end();

        } catch (e) {
            logger.log(logger.level.ERROR, "RtcRestHelper.EventManager",
                "sendChatMucWithRoomId :: xmpp create room failed with error  ", e);
            failureCallback(e);
        }
    },

    /**
     * Makes a call to EVM to get RTC server and roomtoken details
     * @param {json} config - Config from session
     * @param {function} successCallback - 
     * @param {function} failureCallback - 
     */
    sendStartMuc: function(config, successCallback, failureCallback) {
        try {

            logger.log(logger.level.INFO, "RtcRestHelper.EventManager",
                "sendStartMuc called ");

            var options = {
                host: Rtcconfig.json.urls.eventManager,
                path: '/v1/xmpp/startmuc/room/' + config.roomId,
                method: 'PUT',
                headers: {
                    "Authorization": "Bearer " + config.irisToken,
                    "Content-Type": "application/json",
                    "Trace-Id": config.traceId
                }
            };

            //For PSTN calls
            if (config.eventType == "pstncall") {

                options.path = '/v1.1/pstn/startmuc/room/' + config.roomId;

                //For PSTN Calls - With only fromTN and toTN
                if (config.useNewApiForPSTN)
                    options.path = '/v1.1/pstn/startmuc/federation/pstn';
            }

            //For Anonymous Video Calls
            if (config.useAnonymousLogin) {

                if (config.roomId) {
                    options.path = "/v1.1/anonymoususers/startmuc/roomid/" + config.roomId;
                } else if (config.roomName) {
                    options.path = "/v1.1/anonymoususers/startmuc/room/" + config.roomName;

                }

                // Anonymous room with limited number of participants
                if (config.maxParticipants && config.roomName) {
                    options.path = "/v1.1/anonymoususers/startmuc/room/" + config.roomName +
                        "?maxparticipants=" + config.maxParticipants;
                }
            }

            var userData = (config.userData && config.eventType != "groupchat") ? config.userData : "";

            logger.log(logger.level.VERBOSE, "RtcRestHelper.EventManager", "sendStartMuc :: Ignore userData for groupchat calls");

            var jsonBody = ""

            if (config.eventType == "pstncall" && config.useNewApiForPSTN) {
                jsonBody = {
                    "inbound": false,
                    "from": config.fromTN,
                    'to': config.mucTN ? config.mucTN : config.toTN,
                    "event_type": config.eventType,
                    "time_posted": Date.now(),
                    "userdata": userData
                };
            } else {
                jsonBody = {
                    "from": config.routingId,
                    "event_type": config.eventType,
                    "time_posted": Date.now(),
                    "userdata": userData
                };
            }

            // JSON body 
            if (config.rtcServer) {
                jsonBody.rtc_server = config.rtcServer;
            }

            logger.log(logger.level.INFO, "RtcRestHelper.EventManager",
                " startmuc with roomid with options " + JSON.stringify(options) +
                " & body " + JSON.stringify(jsonBody));

            // Send the http request and wait for response
            var req = https.request(options, function(response) {
                var body = ''

                // Callback for data
                response.on('data', function(chunk) {
                    body += chunk;
                });

                // Callback when complete data is received
                response.on('end', function() {
                    logger.log(logger.level.INFO, "RtcRestHelper.EventManager",
                        " Received server response  " + body);

                    // check if the status code is correct
                    if (response.statusCode == 400) {
                        failureCallback("Invalid value for max participants", response.statusCode);
                        return;
                    } else if (response.statusCode != 200 && response.statusCode != 201) {

                        logger.log(logger.level.ERROR, "RtcRestHelper.EventManager",
                            " Start muc with roomid failed with status code  " +
                            response.statusCode + " & response " + body);

                        var responseBody = JSON.parse(body);

                        failureCallback("Start muc with roomid failed with status code  " +
                            response.statusCode + " & response " + body, response.statusCode, responseBody);

                        return;

                    } else {

                        // Get the the response json
                        var resJson = JSON.parse(body);
                        successCallback(resJson);
                    }
                });
            });

            // Catch errors 
            req.on('error', function(e) {

                logger.log(logger.level.ERROR, "RtcRestHelper.EventManager",
                    " Start muc with roomid failed with error  " + e);

                failureCallback("Start muc with roomid failed with error " + e);

            });

            // write json
            req.write(JSON.stringify(jsonBody));

            // Write json
            req.end();


        } catch (e) {
            logger.log(logger.level.ERROR, "RtcRestHelper.EventManager",
                "sendStartMuc :: xmpp create room failed with error  ", e);
            failureCallback(e);
        }
    },

    /**
     * Creates an event on evm
     * @param {json} config - Config from session
     * @param {function} successCallback - 
     * @param {function} failureCallback - 
     */
    sendRootEventWithRoomId: function(config, successCallback, failureCallback) {
        try {
            logger.log(logger.level.INFO, "RtcRestHelper.EventManager",
                " sendRootEventWithRoomId called ");

            var options = {
                host: Rtcconfig.json.urls.eventManager,
                path: "/v1.1/xmpp/muc/" + config.roomId + "/upgrade",
                method: 'PUT',
                headers: {
                    "Authorization": "Bearer " + config.irisToken,
                    "Content-Type": "application/json",
                    "Trace-Id": config.traceId
                }
            };

            // JSON body 
            var jsonBody = {
                "event_type": config.eventType,
                "time_posted": Date.now(),
                "userdata": config.userData ? config.userData : ""
            };

            logger.log(logger.level.INFO, "RtcRestHelper.EventManager",
                " root event with roomid with options " + JSON.stringify(options) +
                " & body " + JSON.stringify(jsonBody));

            // Send the http request and wait for response
            var req = https.request(options, function(response) {
                var body = ''

                // Callback for data
                response.on('data', function(chunk) {
                    body += chunk;
                });

                // Callback when complete data is received
                response.on('end', function() {
                    logger.log(logger.level.INFO, "RtcRestHelper.EventManager",
                        " Received server response  " + body);

                    // check if the status code is correct
                    if (response.statusCode != 200) {
                        logger.log(logger.level.ERROR, "RtcRestHelper.EventManager",
                            " Create root event failed with status code  " +
                            response.statusCode + " & response " + body);

                        failureCallback("Create root event failed with status code  " +
                            response.statusCode + " & response " + body);

                        return;
                    } else {

                        // Get the the response json
                        var resJson = JSON.parse(body);
                        successCallback(resJson);
                    }

                });
            });

            // Catch errors 
            req.on('error', function(e) {
                logger.log(logger.level.ERROR, "RtcRestHelper.EventManager",
                    " Create root event with roomid failed with error  " + e);

                failureCallback(e);

            });

            // write json
            req.write(JSON.stringify(jsonBody));

            // Write json
            req.end();


        } catch (e) {
            logger.log(logger.level.ERROR, "RtcRestHelper.EventManager",
                "sendRootEventWithRoomId :: xmpp root event failed with error  ", e);
            failureCallback(e);
        }
    }
}
