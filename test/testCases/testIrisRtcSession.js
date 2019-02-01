// Test Iris Rtc Session API's 

require('../TestConfig')

var RtcErrors = IrisRtcErrors.code;

describe('IrisRtcSession.createSession', () => {
    before(() => {

    });

    it('should throw error with no config', (done) => {

        var irisRtcSession = new IrisRtcSession();
        var irisRtcConnection = new IrisRtcConnection();

        irisRtcSession.onSessionError = function(roomId, errorCode, errorMessage) {
            if (errorCode == RtcErrors.ERR_INCORRECT_PARAMETERS &&
                errorMessage == "createSession :: Invalid user config or rtc connection") {
                done();
            }
        }

        irisRtcSession.createSession("", irisRtcConnection, "");
    });

    it('should throw error with no connection', (done) => {

        var irisRtcSession = new IrisRtcSession();

        irisRtcSession.onSessionError = function(roomId, errorCode, errorMessage) {
            if (errorCode == RtcErrors.ERR_INCORRECT_PARAMETERS &&
                errorMessage == "createSession :: Invalid user config or rtc connection") {
                done();
            }
        }

        irisRtcSession.createSession({ "a": "123456789" }, "", "");
    });

    it('should throw error with connection not having xmpp', (done) => {

        var irisRtcSession = new IrisRtcSession();
        var irisRtcConnection = new IrisRtcConnection();

        irisRtcSession.onSessionError = function(roomId, errorCode, errorMessage) {
            if (errorCode == RtcErrors.ERR_INCORRECT_PARAMETERS &&
                errorMessage == "createSession :: Invalid user config or rtc connection") {
                done();
            }
        }

        irisRtcSession.createSession({ "a": "123456789" }, irisRtcConnection, "");
    });

    it('should throw error with useAnonymousLogin true and no room name', (done) => {

        var irisRtcSession = new IrisRtcSession();
        var irisRtcConnection = new IrisRtcConnection();
        irisRtcConnection.xmpp = { "Dummy": "Dummy" }

        irisRtcSession.onSessionError = function(roomId, errorCode, errorMessage) {
            if (errorCode == RtcErrors.ERR_INCORRECT_PARAMETERS &&
                errorMessage == "createSession :: Invalid roomName") {
                done();
            }
        }
        irisRtcSession.createSession({ "useAnonymousLogin": true }, irisRtcConnection, "");
    });


    it('should throw error with max particpants less than 1', (done) => {

        var irisRtcSession = new IrisRtcSession();
        var irisRtcConnection = new IrisRtcConnection();
        irisRtcConnection.xmpp = { "Dummy": "Dummy" }

        irisRtcSession.onSessionError = function(roomId, errorCode, errorMessage) {
            if (errorCode == RtcErrors.ERR_INCORRECT_PARAMETERS &&
                errorMessage == "createSession :: Invalid number of participants") {
                done();
            }
        }
        irisRtcSession.createSession({ "useAnonymousLogin": true, "roomName": "hello", "maxParticipants": "q" }, irisRtcConnection, "");
    });


    it('should throw error with no roomId', (done) => {

        var irisRtcSession = new IrisRtcSession();
        var irisRtcConnection = new IrisRtcConnection();
        irisRtcConnection.xmpp = { "Dummy": "Dummy" }

        irisRtcSession.onSessionError = function(roomId, errorCode, errorMessage) {
            if (errorCode == RtcErrors.ERR_INCORRECT_PARAMETERS &&
                errorMessage == "createSession :: Invalid roomId") {
                done();
            }
        }
        irisRtcSession.createSession({ "a": "123456789" }, irisRtcConnection, "");
    });

    it('should throw error with no type', (done) => {

        var irisRtcSession = new IrisRtcSession();
        var irisRtcConnection = new IrisRtcConnection();
        irisRtcConnection.xmpp = { "Dummy": "Dummy" }

        irisRtcSession.onSessionError = function(roomId, errorCode, errorMessage) {
            if (errorCode == RtcErrors.ERR_INCORRECT_PARAMETERS &&
                errorMessage == "createSession :: Invalid type") {
                done();
            }
        }
        irisRtcSession.createSession({ "roomId": "123456789" }, irisRtcConnection, "");
    });

    it('should throw error with wrong type', (done) => {

        var irisRtcSession = new IrisRtcSession();
        var irisRtcConnection = new IrisRtcConnection();
        irisRtcConnection.xmpp = { "Dummy": "Dummy" }

        irisRtcSession.onSessionError = function(roomId, errorCode, errorMessage) {
            if (errorCode == RtcErrors.ERR_INCORRECT_PARAMETERS &&
                errorMessage == "createSession :: Invalid type") {
                done();
            }
        }
        irisRtcSession.createSession({ "roomId": "123456789", "type": "hello" }, irisRtcConnection, "");
    });


    it('should throw error with no irisToken', (done) => {

        var irisRtcSession = new IrisRtcSession();
        var irisRtcConnection = new IrisRtcConnection();
        irisRtcConnection.xmpp = { "Dummy": "Dummy" }

        irisRtcSession.onSessionError = function(roomId, errorCode, errorMessage) {
            if (errorCode == RtcErrors.ERR_INCORRECT_PARAMETERS &&
                errorMessage == "createSession :: Invalid irisToken") {
                done();
            }
        }
        irisRtcSession.createSession({ "roomId": "123456789", "type": "video" }, irisRtcConnection, "");
    });

    it('should throw error with no routingId', (done) => {

        var irisRtcSession = new IrisRtcSession();
        var irisRtcConnection = new IrisRtcConnection();
        irisRtcConnection.xmpp = { "Dummy": "Dummy" }

        irisRtcSession.onSessionError = function(roomId, errorCode, errorMessage) {
            if (errorCode == RtcErrors.ERR_INCORRECT_PARAMETERS &&
                errorMessage == "createSession :: Invalid routingId") {
                done();
            }
        }
        irisRtcSession.createSession({ "roomId": "123456789", "type": "video", "irisToken": "irisToken" }, irisRtcConnection, "");
    });

    it('should throw error with recvonly and valid stream', (done) => {

        var irisRtcSession = new IrisRtcSession();
        var irisRtcConnection = new IrisRtcConnection();
        var irisRtcStream = new IrisRtcStream();
        irisRtcStream.localStream = "MediaStream";
        irisRtcConnection.xmpp = { "Dummy": "Dummy" }

        irisRtcSession.onSessionError = function(roomId, errorCode, errorMessage) {
            if (errorCode == RtcErrors.ERR_INCORRECT_PARAMETERS &&
                errorMessage == "createSession :: Stream is not required for recvonly calls") {
                done();
            }
        }
        irisRtcSession.createSession({
            "roomId": "123456789",
            "type": "video",
            "irisToken": "irisToken",
            "routingId": "routingId",
            "stream": "recvonly"
        }, irisRtcConnection, irisRtcStream);
    });

    // it('should throw error with no stream for video call', (done) => {

    //     var irisRtcSession = new IrisRtcSession();
    //     var irisRtcConnection = new IrisRtcConnection();
    //     irisRtcConnection.xmpp = { "Dummy": "Dummy" }

    //     irisRtcSession.onSessionError = function(roomId, errorCode, errorMessage) {
    //         if (errorCode == RtcErrors.ERR_INCORRECT_PARAMETERS &&
    //             errorMessage == "Local media stream is not available") {
    //             done();
    //         }
    //     }
    //     irisRtcSession.createSession({
    //         "roomId": "123456789",
    //         "type": "video",
    //         "irisToken": "irisToken",
    //         "routingId": "routingId",
    //     }, irisRtcConnection, "");
    // });

    it('should throw error with no stream for audio call', (done) => {

        var irisRtcSession = new IrisRtcSession();
        var irisRtcConnection = new IrisRtcConnection();
        irisRtcConnection.xmpp = { "Dummy": "Dummy" }

        irisRtcSession.onSessionError = function(roomId, errorCode, errorMessage) {
            if (errorCode == RtcErrors.ERR_INCORRECT_PARAMETERS &&
                errorMessage == "createSession :: Local media stream is not available") {
                done();
            }
        }
        irisRtcSession.createSession({
            "roomId": "123456789",
            "type": "audio",
            "irisToken": "irisToken",
            "routingId": "routingId",
        }, irisRtcConnection, "");
    });


    it('should throw error with no stream for pstn call', (done) => {

        var irisRtcSession = new IrisRtcSession();
        var irisRtcConnection = new IrisRtcConnection();
        irisRtcConnection.xmpp = { "Dummy": "Dummy" }

        irisRtcSession.onSessionError = function(roomId, errorCode, errorMessage) {
            if (errorCode == RtcErrors.ERR_INCORRECT_PARAMETERS &&
                errorMessage == "createSession :: Local media stream is not available") {
                done();
            }
        }
        irisRtcSession.createSession({
            "roomId": "123456789",
            "type": "pstn",
            "irisToken": "irisToken",
            "routingId": "routingId",
        }, irisRtcConnection, "");
    });


    it('should throw error with no toTN for a pstn call', (done) => {

        var irisRtcSession = new IrisRtcSession();
        var irisRtcConnection = new IrisRtcConnection();
        var irisRtcStream = new IrisRtcStream();
        irisRtcStream.localStream = "MediaStream";
        irisRtcConnection.xmpp = { "Dummy": "Dummy" }

        irisRtcSession.onSessionError = function(roomId, errorCode, errorMessage) {
            if (errorCode == RtcErrors.ERR_INCORRECT_PARAMETERS &&
                errorMessage == "createSession :: For pstn calls toTN, fromTN and toRoutingId are mandatory parameters") {
                done();
            }
        }
        irisRtcSession.createSession({
            "roomId": "123456789",
            "type": "pstn",
            "irisToken": "irisToken",
            "routingId": "routingId",
        }, irisRtcConnection, irisRtcStream);
    });

    it('should throw error with no fromTN for a pstn call', (done) => {

        var irisRtcSession = new IrisRtcSession();
        var irisRtcConnection = new IrisRtcConnection();
        irisRtcConnection.xmpp = { "Dummy": "Dummy" }
        var irisRtcStream = new IrisRtcStream();
        irisRtcStream.localStream = "MediaStream";

        irisRtcSession.onSessionError = function(roomId, errorCode, errorMessage) {
            if (errorCode == RtcErrors.ERR_INCORRECT_PARAMETERS &&
                errorMessage == "createSession :: For pstn calls toTN, fromTN and toRoutingId are mandatory parameters") {
                done();
            }
        }
        irisRtcSession.createSession({
            "roomId": "123456789",
            "type": "pstn",
            "irisToken": "irisToken",
            "routingId": "routingId",
            "toTN": "123456"
        }, irisRtcConnection, irisRtcStream);
    });


    it('should throw error with no toRoutingId for a pstn call', (done) => {

        var irisRtcSession = new IrisRtcSession();
        var irisRtcConnection = new IrisRtcConnection();
        irisRtcConnection.xmpp = { "Dummy": "Dummy" }
        var irisRtcStream = new IrisRtcStream();
        irisRtcStream.localStream = "MediaStream";

        irisRtcSession.onSessionError = function(roomId, errorCode, errorMessage) {
            if (errorCode == RtcErrors.ERR_INCORRECT_PARAMETERS &&
                errorMessage == "createSession :: For pstn calls toTN, fromTN and toRoutingId are mandatory parameters") {
                done();
            }
        }
        irisRtcSession.createSession({
            "roomId": "123456789",
            "type": "pstn",
            "irisToken": "irisToken",
            "routingId": "routingId",
            "toTN": "123456",
            "fromTN": "123457"
        }, irisRtcConnection, irisRtcStream);
    });

    it('should throw error with no audio track for a audio call', (done) => {

        var irisRtcSession = new IrisRtcSession();
        var irisRtcConnection = new IrisRtcConnection();
        irisRtcConnection.xmpp = { "Dummy": "Dummy" }
        var irisRtcStream = new IrisRtcStream();
        irisRtcStream.localStream = "MediaStream";

        irisRtcSession.onSessionError = function(roomId, errorCode, errorMessage) {
            if (errorCode == RtcErrors.ERR_INCORRECT_PARAMETERS &&
                errorMessage == "createSession :: For audio call, send audio stream only") {
                done();
            }
        }
        irisRtcSession.createSession({
            "roomId": "123456789",
            "type": "audio",
            "irisToken": "irisToken",
            "routingId": "routingId",
        }, irisRtcConnection, irisRtcStream);
    });

    it('should throw error with no audio track for a pstn call', (done) => {

        var irisRtcSession = new IrisRtcSession();
        var irisRtcConnection = new IrisRtcConnection();
        irisRtcConnection.xmpp = { "Dummy": "Dummy" }
        var irisRtcStream = new IrisRtcStream();
        irisRtcStream.localStream = "MediaStream";

        irisRtcSession.onSessionError = function(roomId, errorCode, errorMessage) {
            if (errorCode == RtcErrors.ERR_INCORRECT_PARAMETERS &&
                errorMessage == "createSession :: For audio call, send audio stream only") {
                done();
            }
        }
        irisRtcSession.createSession({
            "roomId": "123456789",
            "type": "audio",
            "irisToken": "irisToken",
            "routingId": "routingId",
        }, irisRtcConnection, irisRtcStream);
    });


    // it('should throw error with no video track for video call', (done) => {

    //     var irisRtcSession = new IrisRtcSession();
    //     var irisRtcConnection = new IrisRtcConnection();
    //     irisRtcConnection.xmpp = { "Dummy": "Dummy" }

    //     irisRtcSession.onSessionError = function(roomId, errorCode, errorMessage) {
    //         if (errorCode == RtcErrors.ERR_INCORRECT_PARAMETERS &&
    //             errorMessage == "For video call, video stream is required") {
    //             done();
    //         }
    //     }
    //     irisRtcSession.createSession({
    //         "roomId": "123456789",
    //         "type": "video",
    //         "irisToken": "irisToken",
    //         "routingId": "routingId",
    //     }, irisRtcConnection, { "stream": "stream" });
    // });

    it('should throw error with stream for chat call', (done) => {

        var irisRtcSession = new IrisRtcSession();
        var irisRtcConnection = new IrisRtcConnection();
        irisRtcConnection.xmpp = { "Dummy": "Dummy" }
        var irisRtcStream = new IrisRtcStream();
        irisRtcStream.localStream = "MediaStream";

        irisRtcSession.onSessionError = function(roomId, errorCode, errorMessage) {
            if (errorCode == RtcErrors.ERR_INCORRECT_PARAMETERS &&
                errorMessage == "createSession :: For chat, stream is not required") {
                done();
            }
        }
        irisRtcSession.createSession({
            "roomId": "123456789",
            "type": "chat",
            "irisToken": "irisToken",
            "routingId": "routingId",
        }, irisRtcConnection, irisRtcStream);
    });


    it('should throw error with RtcConfig not updated', (done) => {

        var irisRtcSession = new IrisRtcSession();
        var irisRtcConnection = new IrisRtcConnection();
        irisRtcConnection.xmpp = { "Dummy": "Dummy" }

        irisRtcSession.onSessionError = function(roomId, errorCode, errorMessage) {
            if (errorCode == RtcErrors.ERR_INCORRECT_PARAMETERS &&
                errorMessage == "create :: RtcConfig is not updated") {
                done();
            }
        }
        irisRtcSession.createSession({
            "roomId": "123456789",
            "type": "chat",
            "irisToken": "irisToken",
            "routingId": "routingId",
        }, irisRtcConnection, "");
    });

    it('should throw error with improper connection object', (done) => {

        IrisRtcConfig.updateConfig({
            "urls": {
                "eventManager": "eventManager"
            }
        })

        var irisRtcSession = new IrisRtcSession();
        var irisRtcConnection = new IrisRtcConnection();
        irisRtcConnection.xmpp = { "Dummy": "Dummy" }
        irisRtcConnection.xmpp.sendCallStats = function() {}

        irisRtcSession.onSessionError = function(roomId, errorCode, errorMessage) {
            if (errorCode == RtcErrors.ERR_CREATE_SESSION_FAILED &&
                errorMessage == "createSession :: Failed to create a session") {
                done();
            }
        }
        irisRtcSession.createSession({
            "roomId": "123456789",
            "type": "chat",
            "irisToken": "irisToken",
            "routingId": "routingId",
        }, irisRtcConnection, "");
    });

    after(() => {

    });
});

describe('IrisRtcSession.createSessionWithTN', () => {
    before(() => {

    });

    it('should throw error with no irisRtcStream', (done) => {

        var irisRtcSession = new IrisRtcSession();
        var irisRtcConnection = new IrisRtcConnection();

        irisRtcSession.onSessionError = function(roomId, errorCode, errorMessage) {
            console.log("Nija", errorCode);
            if (errorCode == RtcErrors.ERR_INCORRECT_PARAMETERS &&
                errorMessage == "createSessionWithTN :: Media stream is required to make a call") {
                done();
            }
        }

        irisRtcSession.createSessionWithTN("", "", "");
    });

    it('should throw error with no config', (done) => {

        var irisRtcSession = new IrisRtcSession();
        var irisRtcConnection = new IrisRtcConnection();

        irisRtcSession.onSessionError = function(roomId, errorCode, errorMessage) {
            if (errorCode == RtcErrors.ERR_INCORRECT_PARAMETERS &&
                errorMessage == "createSessionWithTN :: Invalid user config or rtc connection") {
                done();
            }
        }

        var irisRtcStream = { localStream: "localStream" };

        irisRtcSession.createSessionWithTN("", irisRtcConnection, irisRtcStream);
    });

    it('should throw error with no connection', (done) => {

        var irisRtcSession = new IrisRtcSession();

        irisRtcSession.onSessionError = function(roomId, errorCode, errorMessage) {
            if (errorCode == RtcErrors.ERR_INCORRECT_PARAMETERS &&
                errorMessage == "createSessionWithTN :: Invalid user config or rtc connection") {
                done();
            }
        }
        var irisRtcStream = { localStream: "localStream" };

        irisRtcSession.createSessionWithTN({ "a": "123456789" }, "", irisRtcStream);
    });

    it('should throw error with connection not having xmpp', (done) => {

        var irisRtcSession = new IrisRtcSession();
        var irisRtcConnection = new IrisRtcConnection();

        irisRtcSession.onSessionError = function(roomId, errorCode, errorMessage) {
            if (errorCode == RtcErrors.ERR_INCORRECT_PARAMETERS &&
                errorMessage == "createSessionWithTN :: Invalid user config or rtc connection") {
                done();
            }
        }
        var irisRtcStream = { localStream: "localStream" };

        irisRtcSession.createSessionWithTN({ "a": "123456789" }, irisRtcConnection, irisRtcStream);
    });

    it('should throw error with useAnonymousLogin true', (done) => {

        var irisRtcSession = new IrisRtcSession();
        var irisRtcConnection = new IrisRtcConnection();

        irisRtcSession.onSessionError = function(roomId, errorCode, errorMessage) {
            if (errorCode == RtcErrors.ERR_INCORRECT_PARAMETERS &&
                errorMessage == "createSessionWithTN :: Anonymous PSTN call is not allowed") {
                done();
            }
        }
        var irisRtcConnection = new IrisRtcConnection();
        irisRtcConnection.xmpp = { "Dummy": "Dummy" }
        var irisRtcStream = { localStream: "MediaStream" }
        var config = { useAnonymousLogin: true }

        irisRtcSession.createSessionWithTN(config, irisRtcConnection, irisRtcStream);
    });

    it('should throw error with no type in config', (done) => {

        var irisRtcSession = new IrisRtcSession();
        var irisRtcConnection = new IrisRtcConnection();
        irisRtcConnection.xmpp = { "Dummy": "Dummy" }
        var irisRtcStream = { localStream: "MediaStream" }
        var config = { useAnonymousLogin: false }

        irisRtcSession.onSessionError = function(roomId, errorCode, errorMessage) {
            if (errorCode == RtcErrors.ERR_INCORRECT_PARAMETERS &&
                errorMessage == "createSessionWithTN :: Invalid type") {
                done();
            }
        }

        irisRtcSession.createSessionWithTN(config, irisRtcConnection, irisRtcStream);
    });

    it('should throw error if type in config is not pstn', (done) => {

        var irisRtcSession = new IrisRtcSession();
        var irisRtcConnection = new IrisRtcConnection();
        irisRtcConnection.xmpp = { "Dummy": "Dummy" }
        var irisRtcStream = { localStream: "MediaStream" }

        var config = { useAnonymousLogin: false, type: "video" }

        irisRtcSession.onSessionError = function(roomId, errorCode, errorMessage) {
            if (errorCode == RtcErrors.ERR_INCORRECT_PARAMETERS &&
                errorMessage == "createSessionWithTN :: Invalid type") {
                done();
            }
        }

        irisRtcSession.createSessionWithTN(config, irisRtcConnection, irisRtcStream);
    });


    it('should throw error with no irisToken', (done) => {

        var irisRtcSession = new IrisRtcSession();
        var irisRtcConnection = new IrisRtcConnection();
        irisRtcConnection.xmpp = { "Dummy": "Dummy" }
        var irisRtcStream = { localStream: "MediaStream" }

        irisRtcSession.onSessionError = function(roomId, errorCode, errorMessage) {
            if (errorCode == RtcErrors.ERR_INCORRECT_PARAMETERS &&
                errorMessage == "createSessionWithTN :: Invalid irisToken") {
                done();
            }
        }
        var config = {
            useAnonymousLogin: false,
            type: "pstn",
        }


        irisRtcSession.createSessionWithTN(config, irisRtcConnection, irisRtcStream);
    });

    it('should throw error with no routingId', (done) => {

        var irisRtcSession = new IrisRtcSession();
        var irisRtcConnection = new IrisRtcConnection();
        irisRtcConnection.xmpp = { "Dummy": "Dummy" }
        var irisRtcStream = { localStream: "MediaStream" }

        irisRtcSession.onSessionError = function(roomId, errorCode, errorMessage) {
            if (errorCode == RtcErrors.ERR_INCORRECT_PARAMETERS &&
                errorMessage == "createSessionWithTN :: Invalid routingId") {
                done();
            }
        }

        var config = {
            useAnonymousLogin: false,
            type: "pstn",
            "irisToken": "irisToken"
        }

        irisRtcSession.createSessionWithTN(config, irisRtcConnection, irisRtcStream);
    });


    it('should throw error with no fromTN', (done) => {

        var irisRtcSession = new IrisRtcSession();
        var irisRtcConnection = new IrisRtcConnection();
        irisRtcConnection.xmpp = { "Dummy": "Dummy" }
        var irisRtcStream = { localStream: "MediaStream" }

        irisRtcSession.onSessionError = function(roomId, errorCode, errorMessage) {
            if (errorCode == RtcErrors.ERR_INCORRECT_PARAMETERS &&
                errorMessage == "createSessionWithTN :: For pstn calls toTN and fromTN are mandatory parameters") {
                done();
            }
        }

        var config = {
            useAnonymousLogin: false,
            type: "pstn",
            "irisToken": "irisToken",
            "routingId": "routingId"
        }

        irisRtcSession.createSessionWithTN(config, irisRtcConnection, irisRtcStream);
    });

    it('should throw error with no toTN', (done) => {

        var irisRtcSession = new IrisRtcSession();
        var irisRtcConnection = new IrisRtcConnection();
        irisRtcConnection.xmpp = { "Dummy": "Dummy" }
        var irisRtcStream = { localStream: "MediaStream" }

        irisRtcSession.onSessionError = function(roomId, errorCode, errorMessage) {
            if (errorCode == RtcErrors.ERR_INCORRECT_PARAMETERS &&
                errorMessage == "createSessionWithTN :: For pstn calls toTN and fromTN are mandatory parameters") {
                done();
            }
        }

        var config = {
            useAnonymousLogin: false,
            type: "pstn",
            "irisToken": "irisToken",
            "routingId": "routingId",
            "fromTN": "fromTN"
        }

        irisRtcSession.createSessionWithTN(config, irisRtcConnection, irisRtcStream);
    });

});


/**
 * Test suite for join session API in IrisRtcSession
 */
describe('IrisRtcSession.joinSession', () => {
    before(() => {

    });

    it('should throw error with no notification payload', (done) => {

        var irisRtcSession = new IrisRtcSession();
        var irisRtcConnection = new IrisRtcConnection();

        irisRtcSession.onSessionError = function(roomId, errorCode, errorMessage) {
            if (errorCode == RtcErrors.ERR_INCORRECT_PARAMETERS &&
                errorMessage == "joinSession :: Invalid notificationPayload") {
                done();
            }
        }

        irisRtcSession.joinSession("", "", "", "");
    });


    it('should throw error with no config', (done) => {

        var irisRtcSession = new IrisRtcSession();
        var irisRtcConnection = new IrisRtcConnection();

        irisRtcSession.onSessionError = function(roomId, errorCode, errorMessage) {
            if (errorCode == RtcErrors.ERR_INCORRECT_PARAMETERS &&
                errorMessage == "joinSession :: Invalid config or rtc connection") {
                done();
            }
        }

        irisRtcSession.joinSession("", "", "", { "Notification": "Notification" });
    });


    it('should throw error with no connection', (done) => {

        var irisRtcSession = new IrisRtcSession();
        var irisRtcConnection = new IrisRtcConnection();

        irisRtcSession.onSessionError = function(roomId, errorCode, errorMessage) {
            if (errorCode == RtcErrors.ERR_INCORRECT_PARAMETERS &&
                errorMessage == "joinSession :: Invalid config or rtc connection") {
                done();
            }
        }

        irisRtcSession.joinSession({ "config": "config" }, "", "", { "Notification": "Notification" });
    });

    it('should throw error with connection not having xmpp', (done) => {

        var irisRtcSession = new IrisRtcSession();
        var irisRtcConnection = new IrisRtcConnection();

        irisRtcSession.onSessionError = function(roomId, errorCode, errorMessage) {
            if (errorCode == RtcErrors.ERR_INCORRECT_PARAMETERS &&
                errorMessage == "joinSession :: Invalid config or rtc connection") {
                done();
            }
        }

        irisRtcSession.joinSession({ "config": "config" }, irisRtcConnection, "", { "Notification": "Notification" });
    });

    it('should throw error with no type in config', (done) => {

        var irisRtcSession = new IrisRtcSession();
        var irisRtcConnection = new IrisRtcConnection();
        irisRtcConnection.xmpp = { "Dummy": "Dummy" }

        irisRtcSession.onSessionError = function(roomId, errorCode, errorMessage) {
            if (errorCode == RtcErrors.ERR_INCORRECT_PARAMETERS &&
                errorMessage == "joinSession :: Invalid type") {
                done();
            }
        }

        irisRtcSession.joinSession({ "config": "config" }, irisRtcConnection, "", {
            "roomId": "roomId",
            "roomtoken": "roomtoken",
            "roomtokenexpirytime": "roomtokenexpirytime",
            "traceId": "traceId"
        });
    });

    it('should throw error with wrong type in config', (done) => {

        var irisRtcSession = new IrisRtcSession();
        var irisRtcConnection = new IrisRtcConnection();
        irisRtcConnection.xmpp = { "Dummy": "Dummy" }

        irisRtcSession.onSessionError = function(roomId, errorCode, errorMessage) {
            if (errorCode == RtcErrors.ERR_INCORRECT_PARAMETERS &&
                errorMessage == "joinSession :: Invalid type") {
                done();
            }
        }

        irisRtcSession.joinSession({ "type": "hello" }, irisRtcConnection, "", {
            "roomId": "roomId",
            "roomtoken": "roomtoken",
            "roomtokenexpirytime": "roomtokenexpirytime",
            "traceId": "traceId"
        });
    });

    // it('should throw error no stream for video call', (done) => {

    //     var irisRtcSession = new IrisRtcSession();
    //     var irisRtcConnection = new IrisRtcConnection();
    //     irisRtcConnection.xmpp = { "Dummy": "Dummy" }

    //     irisRtcSession.onSessionError = function(roomId, errorCode, errorMessage) {
    //         if (errorCode == RtcErrors.ERR_INCORRECT_PARAMETERS &&
    //             errorMessage == "Local media stream cannot be null for audio or video call") {
    //             done();
    //         }
    //     }

    //     irisRtcSession.joinSession({ "type": "video" }, irisRtcConnection, "", {
    //         "roomId": "roomId",
    //         "roomtoken": "roomtoken",
    //         "roomtokenexpirytime": "roomtokenexpirytime",
    //         "traceId": "traceId"
    //     });
    // });

    it('should throw error no stream for audio call', (done) => {

        var irisRtcSession = new IrisRtcSession();
        var irisRtcConnection = new IrisRtcConnection();
        irisRtcConnection.xmpp = { "Dummy": "Dummy" }

        irisRtcSession.onSessionError = function(roomId, errorCode, errorMessage) {
            if (errorCode == RtcErrors.ERR_INCORRECT_PARAMETERS &&
                errorMessage == "joinSession :: Local media stream cannot be null for audio or video call") {
                done();
            }
        }

        irisRtcSession.joinSession({ "type": "audio" }, irisRtcConnection, "", {
            "roomId": "roomId",
            "roomtoken": "roomtoken",
            "roomtokenexpirytime": "roomtokenexpirytime",
            "traceId": "traceId"
        });
    });

    it('should throw error no stream for pstn call', (done) => {

        var irisRtcSession = new IrisRtcSession();
        var irisRtcConnection = new IrisRtcConnection();
        irisRtcConnection.xmpp = { "Dummy": "Dummy" }

        irisRtcSession.onSessionError = function(roomId, errorCode, errorMessage) {
            if (errorCode == RtcErrors.ERR_INCORRECT_PARAMETERS &&
                errorMessage == "joinSession :: Local media stream cannot be null for audio or video call") {
                done();
            }
        }

        irisRtcSession.joinSession({ "type": "pstn" }, irisRtcConnection, "", {
            "roomId": "roomId",
            "roomtoken": "roomtoken",
            "roomtokenexpirytime": "roomtokenexpirytime",
            "traceId": "traceId"
        });
    });

    it('should throw error for recvonly video call with stream', (done) => {

        var irisRtcSession = new IrisRtcSession();
        var irisRtcConnection = new IrisRtcConnection();
        irisRtcConnection.xmpp = { "Dummy": "Dummy" }
        var irisRtcStream = new IrisRtcStream();
        irisRtcStream.localStream = "MediaStream";

        irisRtcSession.onSessionError = function(roomId, errorCode, errorMessage) {
            if (errorCode == RtcErrors.ERR_INCORRECT_PARAMETERS &&
                errorMessage == "joinSession :: Stream is not required for recvonly call") {
                done();
            }
        }

        irisRtcSession.joinSession({ "type": "video", "stream": "recvonly" }, irisRtcConnection, irisRtcStream, {
            "roomId": "roomId",
            "roomtoken": "roomtoken",
            "roomtokenexpirytime": "roomtokenexpirytime",
            "traceId": "traceId"
        });
    });

    it('should throw error with no roomId in notification payload', (done) => {

        var irisRtcSession = new IrisRtcSession();
        var irisRtcConnection = new IrisRtcConnection();
        irisRtcConnection.xmpp = { "Dummy": "Dummy" }
        var irisRtcStream = new IrisRtcStream();
        irisRtcStream.localStream = "MediaStream";

        irisRtcSession.onSessionError = function(roomId, errorCode, errorMessage) {
            if (errorCode == RtcErrors.ERR_INCORRECT_PARAMETERS &&
                errorMessage == "joinSession :: Invalid notificationpayload") {
                done();
            }
        }

        irisRtcSession.joinSession({ "type": "video" }, irisRtcConnection, irisRtcStream, { "Notification": "Notification" });
    });


    it('should throw error with no roomtoken in notification payload', (done) => {

        var irisRtcSession = new IrisRtcSession();
        var irisRtcConnection = new IrisRtcConnection();
        irisRtcConnection.xmpp = { "Dummy": "Dummy" }

        irisRtcSession.onSessionError = function(roomId, errorCode, errorMessage) {
            if (errorCode == RtcErrors.ERR_INCORRECT_PARAMETERS &&
                errorMessage == "joinSession :: Invalid notificationpayload") {
                done();
            }
        }

        irisRtcSession.joinSession({ "config": "config" }, irisRtcConnection, "", { "roomId": "roomId" });
    });

    it('should throw error with no roomtokenexpirytime in notification payload', (done) => {

        var irisRtcSession = new IrisRtcSession();
        var irisRtcConnection = new IrisRtcConnection();
        irisRtcConnection.xmpp = { "Dummy": "Dummy" }

        irisRtcSession.onSessionError = function(roomId, errorCode, errorMessage) {
            if (errorCode == RtcErrors.ERR_INCORRECT_PARAMETERS &&
                errorMessage == "joinSession :: Invalid notificationpayload") {
                done();
            }
        }

        irisRtcSession.joinSession({ "config": "config" }, irisRtcConnection, "", { "roomId": "roomId", "roomtoken": "roomtoken" });
    });

    it('should throw error with no rtcserver in notification payload and no rtcServer in config', (done) => {

        var irisRtcSession = new IrisRtcSession();
        var irisRtcConnection = new IrisRtcConnection();
        irisRtcConnection.xmpp = { "Dummy": "Dummy" }
        var irisRtcStream = new IrisRtcStream();
        irisRtcStream.localStream = "MediaStream";

        irisRtcSession.onSessionError = function(roomId, errorCode, errorMessage) {
            if (errorCode == RtcErrors.ERR_INCORRECT_PARAMETERS &&
                errorMessage == "joinSession :: Invalid notificationpayload") {
                done();
            }
        }

        irisRtcSession.joinSession({ "type": "video" }, irisRtcConnection, irisRtcStream, {
            "roomId": "roomId",
            "roomtoken": "roomtoken",
            "roomtokenexpirytime": "roomtokenexpirytime",
            "traceId": "traceId"
        });
    });

    it('should throw error with no routingId in notification payload and in config', (done) => {

        var irisRtcSession = new IrisRtcSession();
        var irisRtcConnection = new IrisRtcConnection();
        irisRtcConnection.xmpp = { "Dummy": "Dummy" }
        var irisRtcStream = new IrisRtcStream();
        irisRtcStream.localStream = "MediaStream";

        irisRtcSession.onSessionError = function(roomId, errorCode, errorMessage) {
            if (errorCode == RtcErrors.ERR_INCORRECT_PARAMETERS &&
                errorMessage == "joinSession :: Invalid notificationpayload") {
                done();
            }
        }

        irisRtcSession.joinSession({ "type": "video" }, irisRtcConnection, irisRtcStream, {
            "roomId": "roomId",
            "roomtoken": "roomtoken",
            "roomtokenexpirytime": "roomtokenexpirytime",
            "traceId": "traceId",
            "rtcserver": "rtcserver"
        });
    });

    it('should throw error with improper connection object', (done) => {

        var irisRtcSession = new IrisRtcSession();
        var irisRtcConnection = new IrisRtcConnection();
        irisRtcConnection.xmpp = { "Dummy": "Dummy" }
        irisRtcConnection.xmpp.sendCallStats = function() {}
        var irisRtcStream = new IrisRtcStream();
        irisRtcStream.localStream = "MediaStream";

        irisRtcSession.onSessionError = function(roomId, errorCode, errorMessage) {
            if (errorCode == RtcErrors.ERR_CREATE_SESSION_FAILED &&
                errorMessage == "joinSession :: Failed to join session") {
                done();
            }
        }

        irisRtcSession.joinSession({ "type": "chat" }, irisRtcConnection, irisRtcStream, {
            "roomId": "roomId",
            "roomtoken": "roomtoken",
            "roomtokenexpirytime": "roomtokenexpirytime",
            "traceId": "traceId",
            "rtcserver": "rtcserver",
            "routingId": "routingId"
        });
    });


    after(() => {

    });

});



describe('IrisRtcSession.createChatSession', () => {
    before(() => {

    });

    it('should throw error with no config and no connection', (done) => {

        var irisRtcSession = new IrisRtcSession();

        irisRtcSession.onSessionError = function(roomId, errorCode, errorMessage) {
            if (errorCode == RtcErrors.ERR_INCORRECT_PARAMETERS &&
                errorMessage == "createChatSession :: Invalid config or rtc connection") {
                done();
            }
        }

        irisRtcSession.createChatSession("", "");

    });

    it('should throw error with no connection', (done) => {

        var irisRtcSession = new IrisRtcSession();

        irisRtcSession.onSessionError = function(roomId, errorCode, errorMessage) {
            if (errorCode == RtcErrors.ERR_INCORRECT_PARAMETERS &&
                errorMessage == "createChatSession :: Invalid config or rtc connection") {
                done();
            }
        }

        irisRtcSession.createChatSession({ "config": "config" }, "");

    });

    it('should throw error with no config', (done) => {

        var irisRtcSession = new IrisRtcSession();
        var irisRtcConnection = new IrisRtcConnection();

        irisRtcSession.onSessionError = function(roomId, errorCode, errorMessage) {
            if (errorCode == RtcErrors.ERR_INCORRECT_PARAMETERS &&
                errorMessage == "createChatSession :: Invalid config or rtc connection") {
                done();
            }
        }

        irisRtcSession.createChatSession("", irisRtcConnection);

    });

    it('should throw error with no connection.xmpp', (done) => {

        var irisRtcSession = new IrisRtcSession();
        var irisRtcConnection = new IrisRtcConnection();

        irisRtcSession.onSessionError = function(roomId, errorCode, errorMessage) {
            if (errorCode == RtcErrors.ERR_INCORRECT_PARAMETERS &&
                errorMessage == "createChatSession :: Invalid config or rtc connection") {
                done();
            }
        }

        irisRtcSession.createChatSession("", irisRtcConnection);

    });

    it('should throw error with no roomId', (done) => {

        var irisRtcSession = new IrisRtcSession();
        var irisRtcConnection = new IrisRtcConnection();
        irisRtcConnection.xmpp = { "Dummy": "Dummy" }

        irisRtcSession.onSessionError = function(roomId, errorCode, errorMessage) {
            if (errorCode == RtcErrors.ERR_INCORRECT_PARAMETERS &&
                errorMessage == "createChatSession :: Invalid roomId") {
                done();
            }
        }

        irisRtcSession.createChatSession({ "config": "config" }, irisRtcConnection);

    });

    it('should throw error with no type', (done) => {

        var irisRtcSession = new IrisRtcSession();
        var irisRtcConnection = new IrisRtcConnection();
        irisRtcConnection.xmpp = { "Dummy": "Dummy" }

        irisRtcSession.onSessionError = function(roomId, errorCode, errorMessage) {
            if (errorCode == RtcErrors.ERR_INCORRECT_PARAMETERS &&
                errorMessage == "createChatSession :: Invalid type") {
                done();
            }
        }

        irisRtcSession.createChatSession({ "roomId": "12345" }, irisRtcConnection);

    });


    it('should throw error with no type', (done) => {

        var irisRtcSession = new IrisRtcSession();
        var irisRtcConnection = new IrisRtcConnection();
        irisRtcConnection.xmpp = { "Dummy": "Dummy" }

        irisRtcSession.onSessionError = function(roomId, errorCode, errorMessage) {
            if (errorCode == RtcErrors.ERR_INCORRECT_PARAMETERS &&
                errorMessage == "createChatSession :: Invalid type") {
                done();
            }
        }

        irisRtcSession.createChatSession({ "roomId": "12345", "type": "video" }, irisRtcConnection);

    });


    it('should throw error with no irisToken', (done) => {

        var irisRtcSession = new IrisRtcSession();
        var irisRtcConnection = new IrisRtcConnection();
        irisRtcConnection.xmpp = { "Dummy": "Dummy" }

        irisRtcSession.onSessionError = function(roomId, errorCode, errorMessage) {
            if (errorCode == RtcErrors.ERR_INCORRECT_PARAMETERS &&
                errorMessage == "createChatSession :: Invalid irisToken") {
                done();
            }
        }

        irisRtcSession.createChatSession({ "roomId": "12345", "type": "chat" }, irisRtcConnection);

    });


    it('should throw error with no routingId', (done) => {

        var irisRtcSession = new IrisRtcSession();
        var irisRtcConnection = new IrisRtcConnection();
        irisRtcConnection.xmpp = { "Dummy": "Dummy" }

        irisRtcSession.onSessionError = function(roomId, errorCode, errorMessage) {
            if (errorCode == RtcErrors.ERR_INCORRECT_PARAMETERS &&
                errorMessage == "createChatSession :: Invalid routingId") {
                done();
            }
        }

        irisRtcSession.createChatSession({ "roomId": "12345", "type": "chat", "irisToken": "tokenhere" }, irisRtcConnection);

    });

    it('should throw error with improper connection object', (done) => {

        var irisRtcSession = new IrisRtcSession();
        var irisRtcConnection = new IrisRtcConnection();
        irisRtcConnection.xmpp = { "Dummy": "Dummy" }
        irisRtcConnection.xmpp.sendCallStats = function() {}

        irisRtcSession.onSessionError = function(roomId, errorCode, errorMessage) {
            if (errorCode == RtcErrors.ERR_CREATE_SESSION_FAILED &&
                errorMessage == "createChatSession :: Failed to create chat session") {
                done();
            }
        }

        irisRtcSession.createChatSession({ "roomId": "12345", "type": "chat", "irisToken": "tokenhere", "routingId": "routingId" }, irisRtcConnection);

    });

    after(() => {

    });

});


describe('IrisRtcSession.joinChatSession', () => {
    before(() => {

    });
    it('should throw error with no config, connection and notification payload', (done) => {

        var irisRtcSession = new IrisRtcSession();

        irisRtcSession.onSessionError = function(roomId, errorCode, errorMessage) {
            if (errorCode == RtcErrors.ERR_INCORRECT_PARAMETERS &&
                errorMessage == "joinChatSession :: Invalid config or connection or notificationPayload") {
                done();
            }
        }

        irisRtcSession.joinChatSession("", "", "");

    });

    it('should throw error with no connection and notification payload', (done) => {

        var irisRtcSession = new IrisRtcSession();

        irisRtcSession.onSessionError = function(roomId, errorCode, errorMessage) {
            if (errorCode == RtcErrors.ERR_INCORRECT_PARAMETERS &&
                errorMessage == "joinChatSession :: Invalid config or connection or notificationPayload") {
                done();
            }
        }

        irisRtcSession.joinChatSession({ "config": "config" }, "", "");

    });

    it('should throw error with no connection.xmpp and notification payload', (done) => {

        var irisRtcSession = new IrisRtcSession();
        var irisRtcConnection = new IrisRtcConnection();

        irisRtcSession.onSessionError = function(roomId, errorCode, errorMessage) {
            if (errorCode == RtcErrors.ERR_INCORRECT_PARAMETERS &&
                errorMessage == "joinChatSession :: Invalid config or connection or notificationPayload") {
                done();
            }
        }

        irisRtcSession.joinChatSession({ "config": "config" }, irisRtcConnection, "");

    });

    it('should throw error with no notification payload', (done) => {

        var irisRtcSession = new IrisRtcSession();
        var irisRtcConnection = new IrisRtcConnection();
        irisRtcConnection.xmpp = { "Dummy": "Dummy" }

        irisRtcSession.onSessionError = function(roomId, errorCode, errorMessage) {
            if (errorCode == RtcErrors.ERR_INCORRECT_PARAMETERS &&
                errorMessage == "joinChatSession :: Invalid config or connection or notificationPayload") {
                done();
            }
        }

        irisRtcSession.joinChatSession({ "config": "config" }, irisRtcConnection, "");

    });

    it('should throw error with no type', (done) => {

        var irisRtcSession = new IrisRtcSession();
        var irisRtcConnection = new IrisRtcConnection();
        irisRtcConnection.xmpp = { "Dummy": "Dummy" }

        irisRtcSession.onSessionError = function(roomId, errorCode, errorMessage) {
            if (errorCode == RtcErrors.ERR_INCORRECT_PARAMETERS &&
                errorMessage == "joinChatSession :: Invalid type") {
                done();
            }
        }

        irisRtcSession.joinChatSession({ "config": "config" }, irisRtcConnection, { "notify": "notify" });

    });


    it('should throw error with wrong type', (done) => {

        var irisRtcSession = new IrisRtcSession();
        var irisRtcConnection = new IrisRtcConnection();
        irisRtcConnection.xmpp = { "Dummy": "Dummy" }

        irisRtcSession.onSessionError = function(roomId, errorCode, errorMessage) {
            if (errorCode == RtcErrors.ERR_INCORRECT_PARAMETERS &&
                errorMessage == "joinChatSession :: Invalid type") {
                done();
            }
        }

        irisRtcSession.joinChatSession({ "type": "video" }, irisRtcConnection, { "notify": "notify" });

    });


    it('should throw error with no roomId in notification payload', (done) => {

        var irisRtcSession = new IrisRtcSession();
        var irisRtcConnection = new IrisRtcConnection();
        irisRtcConnection.xmpp = { "Dummy": "Dummy" }

        irisRtcSession.onSessionError = function(roomId, errorCode, errorMessage) {
            if (errorCode == RtcErrors.ERR_INCORRECT_PARAMETERS &&
                errorMessage == "joinChatSession :: Invalid notification payload") {
                done();
            }
        }

        irisRtcSession.joinChatSession({ "type": "chat" }, irisRtcConnection, { "notify": "notify" });

    });


    it('should throw error with no roomtoken in notification payload', (done) => {

        var irisRtcSession = new IrisRtcSession();
        var irisRtcConnection = new IrisRtcConnection();
        irisRtcConnection.xmpp = { "Dummy": "Dummy" }

        irisRtcSession.onSessionError = function(roomId, errorCode, errorMessage) {
            if (errorCode == RtcErrors.ERR_INCORRECT_PARAMETERS &&
                errorMessage == "joinChatSession :: Invalid notification payload") {
                done();
            }
        }

        irisRtcSession.joinChatSession({ "type": "chat" }, irisRtcConnection, { "roomId": "roomId" });

    });

    it('should throw error with no roomtokenexpirytime in notification payload', (done) => {

        var irisRtcSession = new IrisRtcSession();
        var irisRtcConnection = new IrisRtcConnection();
        irisRtcConnection.xmpp = { "Dummy": "Dummy" }

        irisRtcSession.onSessionError = function(roomId, errorCode, errorMessage) {
            if (errorCode == RtcErrors.ERR_INCORRECT_PARAMETERS &&
                errorMessage == "joinChatSession :: Invalid notification payload") {
                done();
            }
        }

        irisRtcSession.joinChatSession({ "type": "chat" }, irisRtcConnection, { "roomId": "roomId", "roomtoken": "roomtoken" });

    });

    it('should throw error with no traceId in notification payload', (done) => {

        var irisRtcSession = new IrisRtcSession();
        var irisRtcConnection = new IrisRtcConnection();
        irisRtcConnection.xmpp = { "Dummy": "Dummy" }

        irisRtcSession.onSessionError = function(roomId, errorCode, errorMessage) {
            if (errorCode == RtcErrors.ERR_INCORRECT_PARAMETERS &&
                errorMessage == "joinChatSession :: Invalid notification payload") {
                done();
            }
        }

        irisRtcSession.joinChatSession({ "type": "chat" }, irisRtcConnection, { "roomId": "roomId", "roomtoken": "roomtoken" });

    });


    it('should throw error with no routingId in notification payload and config', (done) => {

        var irisRtcSession = new IrisRtcSession();
        var irisRtcConnection = new IrisRtcConnection();
        irisRtcConnection.xmpp = { "Dummy": "Dummy" }

        irisRtcSession.onSessionError = function(roomId, errorCode, errorMessage) {
            if (errorCode == RtcErrors.ERR_INCORRECT_PARAMETERS &&
                errorMessage == "joinChatSession :: Invalid notification payload") {
                done();
            }
        }

        irisRtcSession.joinChatSession({ "type": "chat" }, irisRtcConnection, {
            "roomId": "roomId",
            "roomtoken": "roomtoken",
            "roomtokenexpirytime": "roomtokenexpirytime",
            "traceId": "traceId"
        });

    });

    // it('should throw error with no rtc server in notification payload and config', (done) => {

    //     var irisRtcSession = new IrisRtcSession();
    //     var irisRtcConnection = new IrisRtcConnection();
    //     irisRtcConnection.xmpp = { "Dummy": "Dummy" }

    //     irisRtcSession.onSessionError = function(roomId, errorCode, errorMessage) {
    //         if (errorCode == RtcErrors.ERR_INCORRECT_PARAMETERS &&
    //             errorMessage == "Invalid notification payload") {
    //             done();
    //         }
    //     }

    //     irisRtcSession.joinChatSession({ "type": "chat" }, irisRtcConnection, {
    //         "roomId": "roomId",
    //         "roomtoken": "roomtoken",
    //         "roomtokenexpirytime": "roomtokenexpirytime",
    //         "routingId": "routingId",
    //         "traceId": "traceId"
    //     });

    // });

    it('should throw error with improper connection object', (done) => {

        var irisRtcSession = new IrisRtcSession();
        var irisRtcConnection = new IrisRtcConnection();
        irisRtcConnection.xmpp = { "Dummy": "Dummy" }
        irisRtcConnection.xmpp.sendCallStats = function() {}

        irisRtcSession.onSessionError = function(roomId, errorCode, errorMessage) {
            if (errorCode == RtcErrors.ERR_CREATE_SESSION_FAILED &&
                errorMessage == "joinChatSession :: Failed to join chat session") {
                done();
            }
        }

        irisRtcSession.joinChatSession({ "type": "chat" }, irisRtcConnection, {
            "roomId": "roomId",
            "roomtoken": "roomtoken",
            "roomtokenexpirytime": "roomtokenexpirytime",
            "routingId": "routingId",
            "traceId": "traceId",
            "rtcserver": "rtcserver"
        });

    });


    after(() => {

    });

});

describe('IrisRtcSession.downgradeToChat', () => {
    before(() => {

    });

    it('should throw error with no config and no notification payload', (done) => {

        var irisRtcSession = new IrisRtcSession();
        var irisRtcConnection = new IrisRtcConnection();
        irisRtcConnection.xmpp = { "Dummy": "Dummy" };
        irisRtcSession.connection = irisRtcConnection;

        irisRtcSession.onSessionError = function(roomId, errorCode, errorMessage) {
            if (errorCode == RtcErrors.ERR_INCORRECT_PARAMETERS &&
                errorMessage == "downgradeToChat :: Invalid config or notificationPayload") {
                done();
            }
        }

        irisRtcSession.downgradeToChat("", "");

    });


    it('should throw error with no config', (done) => {

        var irisRtcSession = new IrisRtcSession();
        var irisRtcConnection = new IrisRtcConnection();
        irisRtcConnection.xmpp = { "Dummy": "Dummy" };
        irisRtcSession.connection = irisRtcConnection;

        irisRtcSession.onSessionError = function(roomId, errorCode, errorMessage) {
            if (errorCode == RtcErrors.ERR_INCORRECT_PARAMETERS &&
                errorMessage == "downgradeToChat :: Invalid config or notificationPayload") {
                done();
            }
        }

        irisRtcSession.downgradeToChat("", { "notify": "notify" });

    });


    it('should throw error with no notification payload', (done) => {

        var irisRtcSession = new IrisRtcSession();
        var irisRtcConnection = new IrisRtcConnection();
        irisRtcConnection.xmpp = { "Dummy": "Dummy" };
        irisRtcSession.connection = irisRtcConnection;

        irisRtcSession.onSessionError = function(roomId, errorCode, errorMessage) {
            if (errorCode == RtcErrors.ERR_INCORRECT_PARAMETERS &&
                errorMessage == "downgradeToChat :: Invalid config or notificationPayload") {
                done();
            }
        }

        irisRtcSession.downgradeToChat({ "config": "config" }, "");

    });

    it('should throw error with no irisToken in config', (done) => {

        var irisRtcSession = new IrisRtcSession();
        var irisRtcConnection = new IrisRtcConnection();
        irisRtcConnection.xmpp = { "Dummy": "Dummy" };
        irisRtcSession.connection = irisRtcConnection;

        irisRtcSession.onSessionError = function(roomId, errorCode, errorMessage) {
            if (errorCode == RtcErrors.ERR_INCORRECT_PARAMETERS &&
                errorMessage == "downgradeToChat :: Invalid config or notificationPayload") {
                done();
            }
        }

        irisRtcSession.downgradeToChat({ "config": "config" }, { "notifiy": "notify" });

    });

    it('should throw error with no config in irisRtcSession', (done) => {

        var irisRtcSession = new IrisRtcSession();
        var irisRtcConnection = new IrisRtcConnection();
        irisRtcConnection.xmpp = { "Dummy": "Dummy" };
        irisRtcSession.connection = irisRtcConnection;

        irisRtcSession.onSessionError = function(roomId, errorCode, errorMessage) {
            if (errorCode == RtcErrors.ERR_INCORRECT_PARAMETERS &&
                errorMessage == "downgradeToChat :: Failed to downgrade to chat session") {
                done();
            }
        }

        irisRtcSession.downgradeToChat({ "irisToken": "irisToken", "sessionType": "sessionType" }, { "notifiy": "notify" });

    });

    it('should throw error with invalid irisRtcSession', (done) => {

        var irisRtcSession = new IrisRtcSession();
        var irisRtcConnection = new IrisRtcConnection();
        irisRtcConnection.xmpp = { "Dummy": "Dummy" };
        irisRtcSession.connection = irisRtcConnection;
        irisRtcSession.config = { "cof": "cof" };

        irisRtcSession.onSessionError = function(roomId, errorCode, errorMessage) {
            if (errorCode == RtcErrors.ERR_INCORRECT_PARAMETERS &&
                errorMessage == "downgradeToChat :: Failed to downgrade to chat session") {
                done();
            }
        }

        irisRtcSession.downgradeToChat({ "irisToken": "irisToken", "sessionType": "sessionType" }, { "notifiy": "notify" });

    });



    after(() => {

    });

});

describe('IrisRtcSession.upgradeToVideo', () => {
    before(() => {

    });

    it('should throw error with no stream, no config and no notification payload', (done) => {

        var irisRtcSession = new IrisRtcSession();
        var irisRtcConnection = new IrisRtcConnection();
        irisRtcConnection.xmpp = { "Dummy": "Dummy" };
        irisRtcSession.connection = irisRtcConnection;

        irisRtcSession.onSessionError = function(roomId, errorCode, errorMessage) {
            if (errorCode == RtcErrors.ERR_INCORRECT_PARAMETERS &&
                errorMessage == "upgradeToVideo :: Invalid stream or config or notificationPayload") {
                done();
            }
        }

        irisRtcSession.upgradeToVideo("", "", "");

    });

    it('should throw error with no config and no notification payload', (done) => {

        var irisRtcSession = new IrisRtcSession();
        var irisRtcConnection = new IrisRtcConnection();
        irisRtcConnection.xmpp = { "Dummy": "Dummy" };
        irisRtcSession.connection = irisRtcConnection;

        irisRtcSession.onSessionError = function(roomId, errorCode, errorMessage) {
            if (errorCode == RtcErrors.ERR_INCORRECT_PARAMETERS &&
                errorMessage == "upgradeToVideo :: Invalid stream or config or notificationPayload") {
                done();
            }
        }

        irisRtcSession.upgradeToVideo({ "Stream": "stream" }, "", "");

    });

    it('should throw error with no irisToken', (done) => {

        var irisRtcSession = new IrisRtcSession();
        var irisRtcConnection = new IrisRtcConnection();
        irisRtcConnection.xmpp = { "Dummy": "Dummy" };
        irisRtcSession.connection = irisRtcConnection;

        irisRtcSession.onSessionError = function(roomId, errorCode, errorMessage) {
            if (errorCode == RtcErrors.ERR_INCORRECT_PARAMETERS &&
                errorMessage == "upgradeToVideo :: Invalid stream or config or notificationPayload") {
                done();
            }
        }

        irisRtcSession.upgradeToVideo({ "Stream": "stream" }, { "config": "config" }, "");

    });


    it('should throw error with invalid session config ', (done) => {

        var irisRtcSession = new IrisRtcSession();
        var irisRtcConnection = new IrisRtcConnection();
        irisRtcConnection.xmpp = { "Dummy": "Dummy" };
        irisRtcSession.connection = irisRtcConnection;

        irisRtcSession.onSessionError = function(roomId, errorCode, errorMessage) {
            if (errorCode == RtcErrors.ERR_INCORRECT_PARAMETERS &&
                errorMessage == "upgradeToVideo :: Failed to upgrade to video session") {
                done();
            }
        }

        irisRtcSession.upgradeToVideo({ "Stream": "stream" }, { "irisToken": "irisToken" }, "");

    });

    it('should throw error with invalid userData for sessionType create ', (done) => {

        var irisRtcSession = new IrisRtcSession();

        irisRtcSession.onSessionError = function(roomId, errorCode, errorMessage) {
            if (errorCode == RtcErrors.ERR_INCORRECT_PARAMETERS &&
                errorMessage == "upgradeToVideo :: Invalid config, no userData available") {
                done();
            }
        }

        irisRtcSession.upgradeToVideo({ "Stream": "stream" }, { "irisToken": "irisToken", "sessionType": "create" }, "");

    });


    it('should throw error with invalid notification payload for sessionType join ', (done) => {

        var irisRtcSession = new IrisRtcSession();

        irisRtcSession.onSessionError = function(roomId, errorCode, errorMessage) {
            if (errorCode == RtcErrors.ERR_INCORRECT_PARAMETERS &&
                errorMessage == "upgradeToVideo :: Invalid notificationPayload") {
                done();
            }
        }

        irisRtcSession.upgradeToVideo({ "Stream": "stream" }, { "irisToken": "irisToken", "sessionType": "join" }, "");

    });

    it('should throw error with no roomId in notification payload for sessionType join ', (done) => {

        var irisRtcSession = new IrisRtcSession();

        irisRtcSession.onSessionError = function(roomId, errorCode, errorMessage) {
            if (errorCode == RtcErrors.ERR_INCORRECT_PARAMETERS &&
                errorMessage == "upgradeToVideo :: Invalid notificationPayload") {
                done();
            }
        }

        irisRtcSession.upgradeToVideo({ "Stream": "stream" }, { "irisToken": "irisToken", "sessionType": "join" }, { "notify": "notify" });

    });


    it('should throw error with no roomtoken in notification payload for sessionType join ', (done) => {

        var irisRtcSession = new IrisRtcSession();

        irisRtcSession.onSessionError = function(roomId, errorCode, errorMessage) {
            if (errorCode == RtcErrors.ERR_INCORRECT_PARAMETERS &&
                errorMessage == "upgradeToVideo :: Invalid notificationPayload") {
                done();
            }
        }

        irisRtcSession.upgradeToVideo({ "Stream": "stream" }, { "irisToken": "irisToken", "sessionType": "join" }, {
            "roomId": "roomId",
        });

    });


    it('should throw error with no roomtokenexpirytime in notification payload for sessionType join ', (done) => {

        var irisRtcSession = new IrisRtcSession();

        irisRtcSession.onSessionError = function(roomId, errorCode, errorMessage) {
            if (errorCode == RtcErrors.ERR_INCORRECT_PARAMETERS &&
                errorMessage == "upgradeToVideo :: Invalid notificationPayload") {
                done();
            }
        }

        irisRtcSession.upgradeToVideo({ "Stream": "stream" }, { "irisToken": "irisToken", "sessionType": "join" }, {
            "roomId": "roomId",
            "roomtoken": "roomtoken"
        });

    });


    it('should throw error with no traceId in notification payload for sessionType join ', (done) => {

        var irisRtcSession = new IrisRtcSession();

        irisRtcSession.onSessionError = function(roomId, errorCode, errorMessage) {
            if (errorCode == RtcErrors.ERR_INCORRECT_PARAMETERS &&
                errorMessage == "upgradeToVideo :: Invalid notificationPayload") {
                done();
            }
        }

        irisRtcSession.upgradeToVideo({ "Stream": "stream" }, { "irisToken": "irisToken", "sessionType": "join" }, {
            "roomId": "roomId",
            "roomtoken": "roomtoken",
            "roomtokenexpirytime": "roomtokenexpirytime"
        });

    });

    //Need to write more test cases for real time scenario where irisRtcSession and 
    //connection are valid. With notification payload need to write more test cases


    after(() => {

    });

});

describe('IrisRtcSession.endSession', () => {
    before(() => {

    });

    it('should throw error with no roomId ', (done) => {

        var irisRtcSession = new IrisRtcSession();

        irisRtcSession.onSessionError = function(roomId, errorCode, errorMessage) {
            if (errorCode == RtcErrors.ERR_INCORRECT_PARAMETERS &&
                errorMessage == "endSession :: End session called with wrong roomId") {
                done();
            }
        }

        irisRtcSession.endSession("");

    });

    after(() => {

    });

});

describe('IrisRtcSession.switchStream', () => {
    before(() => {

    });

    it('should throw error with no roomId, no irisRtcStream object and no streamConfig ', (done) => {

        var irisRtcSession = new IrisRtcSession();
        irisRtcSession.config = {
            "roomId": "1234"
        }

        irisRtcSession.onSessionError = function(roomId, errorCode, errorMessage) {
            if (errorCode == RtcErrors.ERR_INCORRECT_PARAMETERS &&
                errorMessage == "switchStream :: Invalid parameters") {
                done();
            }
        }

        irisRtcSession.switchStream("", "", "");

    });


    it('should throw error with no irisRtcStream object and no streamConfig ', (done) => {

        var irisRtcSession = new IrisRtcSession();
        irisRtcSession.config = {
            "roomId": "1234"
        }

        irisRtcSession.onSessionError = function(roomId, errorCode, errorMessage) {
            if (errorCode == RtcErrors.ERR_INCORRECT_PARAMETERS &&
                errorMessage == "switchStream :: Invalid parameters") {
                done();
            }
        }

        irisRtcSession.switchStream("1234", "", "");

    });


    it('should throw error with no streamConfig', (done) => {

        var irisRtcSession = new IrisRtcSession();
        var irisRtcStream = new IrisRtcStream();
        irisRtcSession.config = {
            "roomId": "1234"
        }

        irisRtcSession.onSessionError = function(roomId, errorCode, errorMessage) {
            if (errorCode == RtcErrors.ERR_INCORRECT_PARAMETERS &&
                errorMessage == "switchStream :: Invalid parameters") {
                done();
            }
        }

        irisRtcSession.switchStream("1234", irisRtcStream, "");

    });


    it('should throw error with no screenShare param streamConfig', (done) => {

        var irisRtcSession = new IrisRtcSession();
        var irisRtcStream = new IrisRtcStream();
        irisRtcSession.config = {
            "roomId": "1234"
        }

        irisRtcSession.onSessionError = function(roomId, errorCode, errorMessage) {
            if (errorCode == RtcErrors.ERR_INCORRECT_PARAMETERS &&
                errorMessage == "switchStream :: Invalid parameters") {
                done();
            }
        }

        irisRtcSession.switchStream("1234", irisRtcStream, { "screenShare": "screen" });

    });


    it('should throw error if screenShare param in streamConfig type is a string', (done) => {

        var irisRtcSession = new IrisRtcSession();
        var irisRtcStream = new IrisRtcStream();
        irisRtcSession.config = {
            "roomId": "1234"
        }

        irisRtcSession.onSessionError = function(roomId, errorCode, errorMessage) {
            if (errorCode == RtcErrors.ERR_INCORRECT_PARAMETERS &&
                errorMessage == "switchStream :: Invalid parameters") {
                done();
            }
        }

        irisRtcSession.switchStream("1234", irisRtcStream, { "screenShare": "screen" });

    });


    it('should throw error if screenShare param in streamConfig type is a integer', (done) => {

        var irisRtcSession = new IrisRtcSession();
        var irisRtcStream = new IrisRtcStream();
        irisRtcSession.config = {
            "roomId": "1234"
        }

        irisRtcSession.onSessionError = function(roomId, errorCode, errorMessage) {
            if (errorCode == RtcErrors.ERR_INCORRECT_PARAMETERS &&
                errorMessage == "switchStream :: Invalid parameters") {
                done();
            }
        }

        irisRtcSession.switchStream("1234", irisRtcStream, { "screenShare": 1 });

    });


    it('should throw error with no streamType and no constraints in streamConfig', (done) => {

        var irisRtcSession = new IrisRtcSession();
        var irisRtcStream = new IrisRtcStream();
        irisRtcSession.config = {
            "roomId": "1234"
        }

        irisRtcSession.onSessionError = function(roomId, errorCode, errorMessage) {
            if (errorCode == RtcErrors.ERR_INCORRECT_PARAMETERS &&
                errorMessage == "switchStream :: Invalid parameters") {
                done();
            }
        }

        irisRtcSession.switchStream("1234", irisRtcStream, { "screenShare": true });

    });


    it('should throw error with no or wrong roomId', (done) => {

        var irisRtcSession = new IrisRtcSession();
        var irisRtcStream = new IrisRtcStream();
        irisRtcSession.config = {
            "roomId": "12345"
        }

        irisRtcSession.onSessionError = function(roomId, errorCode, errorMessage) {
            if (errorCode == RtcErrors.ERR_INCORRECT_PARAMETERS &&
                errorMessage == "switchStream :: Invalid parameters") {
                done();
            }
        }

        irisRtcSession.switchStream("1234", irisRtcStream, { "screenShare": true });

    });

    it('should throw error with session having no stream', (done) => {

        var irisRtcSession = new IrisRtcSession();
        var irisRtcStream = new IrisRtcStream();
        irisRtcSession.config = {
            "roomId": "1234"
        }

        irisRtcSession.onSessionError = function(roomId, errorCode, errorMessage) {
            if (errorCode == RtcErrors.ERR_INCORRECT_PARAMETERS &&
                errorMessage == "switchStream :: Invalid parameters") {
                done();
            }
        }

        irisRtcSession.switchStream("1234", irisRtcStream, { "screenShare": true, "streamType": "video" });

    });


    it('should throw error with session having no peerconnection', (done) => {

        var irisRtcSession = new IrisRtcSession();
        var irisRtcStream = new IrisRtcStream();
        irisRtcSession.localStream = irisRtcStream;
        irisRtcSession.config = {
            "roomId": "1234"
        }

        irisRtcSession.onSessionError = function(roomId, errorCode, errorMessage) {
            if (errorCode == RtcErrors.ERR_INCORRECT_PARAMETERS &&
                errorMessage == "switchStream :: Invalid parameters") {
                done();
            }
        }

        irisRtcSession.switchStream("1234", irisRtcStream, { "screenShare": true, "streamType": "video" });

    });

    it('should throw error with getUserMedia failure', (done) => {

        var irisRtcSession = new IrisRtcSession();
        var irisRtcStream = new IrisRtcStream();
        irisRtcSession.localStream = irisRtcStream;
        irisRtcSession.peerconnection = { "Dummy": "dummy" }
        irisRtcSession.config = {
            "roomId": "1234"
        }

        irisRtcStream.onStreamError = function(errorCode, errorMessage) {
            if (errorCode == RtcErrors.ERR_CREATE_STREAM_FAILED &&
                errorMessage == "Failed to create stream") {
                done();
            }
        }

        irisRtcSession.onSessionError = function(roomId, errorCode, errorMessage) {
            if (errorCode == RtcErrors.ERR_CREATE_STREAM_FAILED &&
                errorMessage == "switchStream :: Failed to create stream") {
                done();
            }
        }

        irisRtcSession.switchStream("1234", irisRtcStream, { "screenShare": true, "streamType": "video" });

    });


    after(() => {

    });

});

describe('IrisRtcSession.muteParticipantVideo', () => {
    before(() => {

    });

    it('should throw error with no roomId, no participantJid and no mute condition', (done) => {

        var irisRtcSession = new IrisRtcSession();

        irisRtcSession.onSessionError = function(roomId, errorCode, errorMessage) {
            if (errorCode == RtcErrors.ERR_INCORRECT_PARAMETERS &&
                errorMessage == "muteParticipantVideo :: Invalid parameters") {
                done();
            }
        }

        irisRtcSession.muteParticipantVideo("", "", "");

    });

    it('should throw error with no participantJid and no mute condition', (done) => {

        var irisRtcSession = new IrisRtcSession();

        irisRtcSession.onSessionError = function(roomId, errorCode, errorMessage) {
            if (errorCode == RtcErrors.ERR_INCORRECT_PARAMETERS &&
                errorMessage == "muteParticipantVideo :: Invalid parameters") {
                done();
            }
        }

        irisRtcSession.muteParticipantVideo("1234", "", "");

    });


    it('should throw error with no mute condition', (done) => {

        var irisRtcSession = new IrisRtcSession();

        irisRtcSession.onSessionError = function(roomId, errorCode, errorMessage) {
            if (errorCode == RtcErrors.ERR_INCORRECT_PARAMETERS &&
                errorMessage == "muteParticipantVideo :: Invalid parameters") {
                done();
            }
        }

        irisRtcSession.muteParticipantVideo("1234", "participantjid", "");

    });


    it('should throw error with non boolean mute value', (done) => {

        var irisRtcSession = new IrisRtcSession();

        irisRtcSession.onSessionError = function(roomId, errorCode, errorMessage) {
            if (errorCode == RtcErrors.ERR_INCORRECT_PARAMETERS &&
                errorMessage == "muteParticipantVideo :: Invalid parameters") {
                done();
            }
        }

        irisRtcSession.muteParticipantVideo("1234", "participantjid", "hello");

    });


    it('should throw error with no config in session', (done) => {

        var irisRtcSession = new IrisRtcSession();

        irisRtcSession.onSessionError = function(roomId, errorCode, errorMessage) {
            if (errorCode == RtcErrors.ERR_INCORRECT_PARAMETERS &&
                errorMessage == "muteParticipantVideo :: Invalid parameters") {
                done();
            }
        }

        irisRtcSession.muteParticipantVideo("1234", "participantjid", true);

    });

    it('should throw error with no config in session', (done) => {

        var irisRtcSession = new IrisRtcSession();

        irisRtcSession.onSessionError = function(roomId, errorCode, errorMessage) {
            if (errorCode == RtcErrors.ERR_INCORRECT_PARAMETERS &&
                errorMessage == "muteParticipantVideo :: Invalid parameters") {
                done();
            }
        }

        irisRtcSession.muteParticipantVideo("1234", "participantjid", true);

    });

    it('should throw error with no roomId in sessions config', (done) => {

        var irisRtcSession = new IrisRtcSession();
        irisRtcSession.config = {
            "config": "config"
        }

        irisRtcSession.onSessionError = function(roomId, errorCode, errorMessage) {
            if (errorCode == RtcErrors.ERR_INCORRECT_PARAMETERS &&
                errorMessage == "muteParticipantVideo :: Invalid parameters") {
                done();
            }
        }

        irisRtcSession.muteParticipantVideo("1234", "participantjid", true);

    });


    it('should throw error with roomId mismatch', (done) => {

        var irisRtcSession = new IrisRtcSession();
        irisRtcSession.config = {
            "roomId": "12345"
        }

        irisRtcSession.onSessionError = function(roomId, errorCode, errorMessage) {
            if (errorCode == RtcErrors.ERR_INCORRECT_PARAMETERS &&
                errorMessage == "muteParticipantVideo :: Invalid parameters") {
                done();
            }
        }

        irisRtcSession.muteParticipantVideo("1234", "participantjid", true);

    });

    after(() => {

    });

});


describe('IrisRtcSession.muteParticipantAudio', () => {
    before(() => {

    });

    it('should throw error with no roomId, no participantJid and no mute condition', (done) => {

        var irisRtcSession = new IrisRtcSession();

        irisRtcSession.onSessionError = function(roomId, errorCode, errorMessage) {
            if (errorCode == RtcErrors.ERR_INCORRECT_PARAMETERS &&
                errorMessage == "muteParticipantAudio :: Invalid parameters") {
                done();
            }
        }

        irisRtcSession.muteParticipantAudio("", "", "");

    });

    it('should throw error with no participantJid and no mute condition', (done) => {

        var irisRtcSession = new IrisRtcSession();

        irisRtcSession.onSessionError = function(roomId, errorCode, errorMessage) {
            if (errorCode == RtcErrors.ERR_INCORRECT_PARAMETERS &&
                errorMessage == "muteParticipantAudio :: Invalid parameters") {
                done();
            }
        }

        irisRtcSession.muteParticipantAudio("1234", "", "");

    });


    it('should throw error with no mute condition', (done) => {

        var irisRtcSession = new IrisRtcSession();

        irisRtcSession.onSessionError = function(roomId, errorCode, errorMessage) {
            if (errorCode == RtcErrors.ERR_INCORRECT_PARAMETERS &&
                errorMessage == "muteParticipantAudio :: Invalid parameters") {
                done();
            }
        }

        irisRtcSession.muteParticipantAudio("1234", "participantjid", "");

    });


    it('should throw error with non boolean mute value', (done) => {

        var irisRtcSession = new IrisRtcSession();

        irisRtcSession.onSessionError = function(roomId, errorCode, errorMessage) {
            if (errorCode == RtcErrors.ERR_INCORRECT_PARAMETERS &&
                errorMessage == "muteParticipantAudio :: Invalid parameters") {
                done();
            }
        }

        irisRtcSession.muteParticipantAudio("1234", "participantjid", "hello");

    });


    it('should throw error with no config in session', (done) => {

        var irisRtcSession = new IrisRtcSession();

        irisRtcSession.onSessionError = function(roomId, errorCode, errorMessage) {
            if (errorCode == RtcErrors.ERR_INCORRECT_PARAMETERS &&
                errorMessage == "muteParticipantAudio :: Invalid parameters") {
                done();
            }
        }

        irisRtcSession.muteParticipantAudio("1234", "participantjid", true);

    });

    it('should throw error with no config in session', (done) => {

        var irisRtcSession = new IrisRtcSession();

        irisRtcSession.onSessionError = function(roomId, errorCode, errorMessage) {
            if (errorCode == RtcErrors.ERR_INCORRECT_PARAMETERS &&
                errorMessage == "muteParticipantAudio :: Invalid parameters") {
                done();
            }
        }

        irisRtcSession.muteParticipantAudio("1234", "participantjid", true);

    });

    it('should throw error with no roomId in sessions config', (done) => {

        var irisRtcSession = new IrisRtcSession();
        irisRtcSession.config = {
            "config": "config"
        }

        irisRtcSession.onSessionError = function(roomId, errorCode, errorMessage) {
            if (errorCode == RtcErrors.ERR_INCORRECT_PARAMETERS &&
                errorMessage == "muteParticipantAudio :: Invalid parameters") {
                done();
            }
        }

        irisRtcSession.muteParticipantAudio("1234", "participantjid", true);

    });


    it('should throw error with roomId mismatch', (done) => {

        var irisRtcSession = new IrisRtcSession();
        irisRtcSession.config = {
            "roomId": "12345"
        }

        irisRtcSession.onSessionError = function(roomId, errorCode, errorMessage) {
            if (errorCode == RtcErrors.ERR_INCORRECT_PARAMETERS &&
                errorMessage == "muteParticipantAudio :: Invalid parameters") {
                done();
            }
        }

        irisRtcSession.muteParticipantAudio("1234", "participantjid", true);

    });


    after(() => {

    });

});


describe('IrisRtcSession.sendChatMessage', () => {
    before(() => {

    });

    it('Anonymous moderated room - should throw error with admin not joined yet ', (done) => {

        var irisRtcSession = new IrisRtcSession();
        irisRtcSession.config = {};
        irisRtcSession.config.useAnonymousLogin = true;
        irisRtcSession.isRoomModerated = true;
        irisRtcSession.isSessionAdministratorJoined = false;

        irisRtcSession.onSessionError = function(roomId, errorCode, errorMessage) {
            if (errorCode == RtcErrors.ERR_SESSION_ADMIN_NOT_JOINED &&
                errorMessage == "sendChatMessage :: Admin hasn't joined room yet") {
                done();
            }
        }

        irisRtcSession.sendChatMessage("", "", "");

    });

    it('should throw error with no roomId, no id and no message', (done) => {

        var irisRtcSession = new IrisRtcSession();
        irisRtcSession.config = {};
        irisRtcSession.config.useAnonymousLogin = true;

        irisRtcSession.onSessionError = function(roomId, errorCode, errorMessage) {
            if (errorCode == RtcErrors.ERR_API_PARAMETERS &&
                errorMessage == "sendChatMessage :: Invalid parameters") {
                done();
            }
        }

        irisRtcSession.sendChatMessage("", "", "");

    });

    it('should throw error with no id and no message', (done) => {

        var irisRtcSession = new IrisRtcSession();
        irisRtcSession.config = {};
        irisRtcSession.config.useAnonymousLogin = true;

        irisRtcSession.onSessionError = function(roomId, errorCode, errorMessage) {
            if (errorCode == RtcErrors.ERR_API_PARAMETERS &&
                errorMessage == "sendChatMessage :: Invalid parameters") {
                done();
            }
        }

        irisRtcSession.sendChatMessage("1234", "", "");

    });


    it('should throw error with no message', (done) => {

        var irisRtcSession = new IrisRtcSession();
        irisRtcSession.config = {};
        irisRtcSession.config.useAnonymousLogin = true;

        irisRtcSession.onSessionError = function(roomId, errorCode, errorMessage) {
            if (errorCode == RtcErrors.ERR_API_PARAMETERS &&
                errorMessage == "sendChatMessage :: Invalid parameters") {
                done();
            }
        }

        irisRtcSession.sendChatMessage("1234", "id", "");

    });


    it('should throw error with no config in session ', (done) => {

        var irisRtcSession = new IrisRtcSession();
        irisRtcSession.config = {};
        irisRtcSession.config.useAnonymousLogin = true;

        irisRtcSession.onSessionError = function(roomId, errorCode, errorMessage) {
            if (errorCode == RtcErrors.ERR_API_PARAMETERS &&
                errorMessage == "sendChatMessage :: Invalid parameters") {
                done();
            }
        }

        irisRtcSession.sendChatMessage("1234", "id", "Hello");

    });

    it('should throw error with no roomId in session config', (done) => {

        var irisRtcSession = new IrisRtcSession();
        irisRtcSession.config = {
            "config": "config"
        }

        irisRtcSession.onSessionError = function(roomId, errorCode, errorMessage) {
            if (errorCode == RtcErrors.ERR_API_PARAMETERS &&
                errorMessage == "sendChatMessage :: Invalid parameters") {
                done();
            }
        }

        irisRtcSession.sendChatMessage("1234", "id", "hello");

    });



    it('should throw error with mismatched roomId', (done) => {

        var irisRtcSession = new IrisRtcSession();
        irisRtcSession.config = {
            "roomId": "123"
        }

        irisRtcSession.onSessionError = function(roomId, errorCode, errorMessage) {
            if (errorCode == RtcErrors.ERR_API_PARAMETERS &&
                errorMessage == "sendChatMessage :: Invalid parameters") {
                done();
            }
        }

        irisRtcSession.sendChatMessage("1234", "id", "hello");

    });

    it('should throw error with empty message', (done) => {

        var irisRtcSession = new IrisRtcSession();
        irisRtcSession.config = {
            "roomId": "1234"
        }

        irisRtcSession.onSessionError = function(roomId, errorCode, errorMessage) {
            if (errorCode == RtcErrors.ERR_API_PARAMETERS &&
                errorMessage == "sendChatMessage :: Invalid parameters") {
                done();
            }
        }

        irisRtcSession.sendChatMessage("1234", "id", " ");

    });


    it('should throw error with message as integer', (done) => {

        var irisRtcSession = new IrisRtcSession();
        irisRtcSession.config = {
            "roomId": "1234"
        }

        irisRtcSession.onSessionError = function(roomId, errorCode, errorMessage) {
            if (errorCode == RtcErrors.ERR_API_PARAMETERS &&
                errorMessage == "sendChatMessage :: Invalid parameters") {
                done();
            }
        }

        irisRtcSession.sendChatMessage("1234", "id", 12344);

    });

    it('should throw error with id as integer ', (done) => {

        var irisRtcSession = new IrisRtcSession();
        irisRtcSession.config = {
            "roomId": "1234"
        }

        irisRtcSession.onSessionError = function(roomId, errorCode, errorMessage) {
            if (errorCode == RtcErrors.ERR_API_PARAMETERS &&
                errorMessage == "sendChatMessage :: Invalid parameters") {
                done();
            }
        }

        irisRtcSession.sendChatMessage("1234", 1234556, "hello");

    });

    after(() => {

    });

});


describe('IrisRtcSession.sendChatState', () => {
    before(() => {

    });

    it('should throw error with no roomId and no chatState', (done) => {

        var irisRtcSession = new IrisRtcSession();
        irisRtcSession.config = {
            "eventType": "videocall"
        }

        irisRtcSession.onSessionError = function(roomId, errorCode, errorMessage) {
            if (errorCode == RtcErrors.ERR_API_PARAMETERS &&
                errorMessage == "sendChatState :: Invalid parameters") {
                done();
            }
        }

        irisRtcSession.sendChatState("", "");

    });

    it('should throw error with no chatState', (done) => {

        var irisRtcSession = new IrisRtcSession();
        irisRtcSession.config = {
            "eventType": "videocall"
        }

        irisRtcSession.onSessionError = function(roomId, errorCode, errorMessage) {
            if (errorCode == RtcErrors.ERR_API_PARAMETERS &&
                errorMessage == "sendChatState :: Invalid parameters") {
                done();
            }
        }

        irisRtcSession.sendChatState("1234", "");

    });


    it('should throw error with no roomId', (done) => {

        var irisRtcSession = new IrisRtcSession();
        irisRtcSession.config = {
            "eventType": "videocall"
        }

        irisRtcSession.onSessionError = function(roomId, errorCode, errorMessage) {
            if (errorCode == RtcErrors.ERR_API_PARAMETERS &&
                errorMessage == "sendChatState :: Invalid parameters") {
                done();
            }
        }

        irisRtcSession.sendChatState("", "hello");

    });


    it('should throw error with no config in session', (done) => {

        var irisRtcSession = new IrisRtcSession();
        irisRtcSession.config = {
            "eventType": "videocall"
        }

        irisRtcSession.onSessionError = function(roomId, errorCode, errorMessage) {
            if (errorCode == RtcErrors.ERR_API_PARAMETERS &&
                errorMessage == "sendChatState :: Invalid parameters") {
                done();
            }
        }

        irisRtcSession.sendChatState("1234", "hello");

    });

    it('should throw error with no roomId in sessions config', (done) => {

        var irisRtcSession = new IrisRtcSession();
        irisRtcSession.config = {
            "config": "config",
            "eventType": "videocall"
        }

        irisRtcSession.onSessionError = function(roomId, errorCode, errorMessage) {
            if (errorCode == RtcErrors.ERR_API_PARAMETERS &&
                errorMessage == "sendChatState :: Invalid parameters") {
                done();
            }
        }

        irisRtcSession.sendChatState("1234", "hello");

    });

    it('should throw error with roomId mismatch', (done) => {

        var irisRtcSession = new IrisRtcSession();
        irisRtcSession.config = {
            "roomId": "12345"
        }

        irisRtcSession.onSessionError = function(roomId, errorCode, errorMessage) {
            if (errorCode == RtcErrors.ERR_API_PARAMETERS &&
                errorMessage == "sendChatState :: Invalid parameters") {
                done();
            }
        }

        irisRtcSession.sendChatState("1234", "hello");

    });

    it('should throw error with invalid chat state', (done) => {

        var irisRtcSession = new IrisRtcSession();
        irisRtcSession.config = {
            "roomId": "1234"
        }

        irisRtcSession.onSessionError = function(roomId, errorCode, errorMessage) {
            if (errorCode == RtcErrors.ERR_API_PARAMETERS &&
                errorMessage == "sendChatState :: Invalid parameters") {
                done();
            }
        }

        irisRtcSession.sendChatState("1234", "hello");

    });


    after(() => {

    });

});

describe('IrisRtcSession.setDisplayName', () => {
    before(() => {

    });


    it('should throw error with no roomId and no name', (done) => {

        var irisRtcSession = new IrisRtcSession();
        irisRtcSession.onSessionError = function(roomId, errorCode, errorMessage) {
            if (errorCode == RtcErrors.ERR_API_PARAMETERS &&
                errorMessage == "setDisplayName :: Invalid parameters") {
                done();
            }
        }

        irisRtcSession.setDisplayName("", "");

    });

    it('should throw error with no name', (done) => {

        var irisRtcSession = new IrisRtcSession();
        irisRtcSession.onSessionError = function(roomId, errorCode, errorMessage) {
            if (errorCode == RtcErrors.ERR_API_PARAMETERS &&
                errorMessage == "setDisplayName :: Invalid parameters") {
                done();
            }
        }

        irisRtcSession.setDisplayName("1234", "");

    });

    it('should throw error with no roomId', (done) => {

        var irisRtcSession = new IrisRtcSession();
        irisRtcSession.onSessionError = function(roomId, errorCode, errorMessage) {
            if (errorCode == RtcErrors.ERR_API_PARAMETERS &&
                errorMessage == "setDisplayName :: Invalid parameters") {
                done();
            }
        }

        irisRtcSession.setDisplayName("", "MyName");

    });

    it('should throw error with no config in session', (done) => {

        var irisRtcSession = new IrisRtcSession();
        irisRtcSession.onSessionError = function(roomId, errorCode, errorMessage) {
            if (errorCode == RtcErrors.ERR_API_PARAMETERS &&
                errorMessage == "setDisplayName :: Invalid parameters") {
                done();
            }
        }

        irisRtcSession.setDisplayName("1234", "MyName");

    });

    it('should throw error with no roomId in session config', (done) => {

        var irisRtcSession = new IrisRtcSession();
        irisRtcSession.config = {
            "config": "config"
        }

        irisRtcSession.onSessionError = function(roomId, errorCode, errorMessage) {
            if (errorCode == RtcErrors.ERR_API_PARAMETERS &&
                errorMessage == "setDisplayName :: Invalid parameters") {
                done();
            }
        }

        irisRtcSession.setDisplayName("1234", "MyName");

    });

    it('should throw error with no roomId in session config', (done) => {

        var irisRtcSession = new IrisRtcSession();
        irisRtcSession.config = {
            "roomId": "1234"
        }

        irisRtcSession.onSessionError = function(roomId, errorCode, errorMessage) {
            if (errorCode == RtcErrors.ERR_API_PARAMETERS &&
                errorMessage == "setDisplayName :: Invalid parameters") {
                done();
            }
        }

        irisRtcSession.setDisplayName("1234", "MyName");

    });

    it('should throw error with improper connection', (done) => {

        var irisRtcSession = new IrisRtcSession();
        irisRtcSession.config = {
            "roomId": "1234"
        }

        irisRtcSession.onSessionError = function(roomId, errorCode, errorMessage) {
            if (errorCode == RtcErrors.ERR_API_PARAMETERS &&
                errorMessage == "setDisplayName :: Invalid parameters") {
                done();
            }
        }

        irisRtcSession.setDisplayName("1234", "MyName");

    });

    it('should throw error with improper connection.xmpp', (done) => {

        var irisRtcSession = new IrisRtcSession();
        var irisRtcConnection = new IrisRtcConnection();
        irisRtcSession.config = {
            "roomId": "1234"
        }
        irisRtcSession.connection = irisRtcConnection;


        irisRtcSession.onSessionError = function(roomId, errorCode, errorMessage) {
            if (errorCode == RtcErrors.ERR_API_PARAMETERS &&
                errorMessage == "setDisplayName :: Invalid parameters") {
                done();
            }
        }

        irisRtcSession.setDisplayName("1234", "MyName");

    });

    it('should throw error with roomId mismatch', (done) => {

        var irisRtcSession = new IrisRtcSession();
        var irisRtcConnection = new IrisRtcConnection();
        irisRtcSession.config = {
            "roomId": "12345"
        }
        irisRtcConnection.xmpp = {
            "Dummy": "Dummy"
        }
        irisRtcSession.connection = irisRtcConnection;


        irisRtcSession.onSessionError = function(roomId, errorCode, errorMessage) {
            if (errorCode == RtcErrors.ERR_API_PARAMETERS &&
                errorMessage == "setDisplayName :: Invalid parameters") {
                done();
            }
        }

        irisRtcSession.setDisplayName("1234", "MyName");

    });


    after(() => {

    });

});

describe('IrisRtcSession.audioMuteToggle', () => {
    before(() => {

    });


    it('should throw error with no roomId', (done) => {

        var irisRtcSession = new IrisRtcSession();

        irisRtcSession.onSessionError = function(roomId, errorCode, errorMessage) {
            if (errorCode == RtcErrors.ERR_API_PARAMETERS &&
                errorMessage == "audioMuteToggle :: Invalid parameters") {
                done();
            }
        }

        irisRtcSession.audioMuteToggle("");

    });


    it('should throw error with no config in session', (done) => {

        var irisRtcSession = new IrisRtcSession();

        irisRtcSession.onSessionError = function(roomId, errorCode, errorMessage) {
            if (errorCode == RtcErrors.ERR_API_PARAMETERS &&
                errorMessage == "audioMuteToggle :: Invalid parameters") {
                done();
            }
        }

        irisRtcSession.audioMuteToggle("1234");

    });


    it('should throw error with no roomId in session config', (done) => {

        var irisRtcSession = new IrisRtcSession();
        irisRtcSession.config = {
            "conf": "conf"
        }

        irisRtcSession.onSessionError = function(roomId, errorCode, errorMessage) {
            if (errorCode == RtcErrors.ERR_API_PARAMETERS &&
                errorMessage == "audioMuteToggle :: Invalid parameters") {
                done();
            }
        }

        irisRtcSession.audioMuteToggle("1234");

    });

    it('should throw error with no connection in session', (done) => {

        var irisRtcSession = new IrisRtcSession();
        irisRtcSession.config = {
            "roomId": "123"
        }

        irisRtcSession.onSessionError = function(roomId, errorCode, errorMessage) {
            if (errorCode == RtcErrors.ERR_API_PARAMETERS &&
                errorMessage == "audioMuteToggle :: Invalid parameters") {
                done();
            }
        }

        irisRtcSession.audioMuteToggle("1234");

    });


    it('should throw error with no connection.xmpp in session', (done) => {

        var irisRtcSession = new IrisRtcSession();
        irisRtcSession.config = {
            "roomId": "123"
        }
        var irisRtcConnection = new IrisRtcConnection();
        irisRtcSession.connection = irisRtcConnection;

        irisRtcSession.onSessionError = function(roomId, errorCode, errorMessage) {
            if (errorCode == RtcErrors.ERR_API_PARAMETERS &&
                errorMessage == "audioMuteToggle :: Invalid parameters") {
                done();
            }
        }

        irisRtcSession.audioMuteToggle("1234");

    });

    it('should throw error with no localStream', (done) => {

        var irisRtcSession = new IrisRtcSession();
        irisRtcSession.config = {
            "roomId": "123"
        }
        var irisRtcConnection = new IrisRtcConnection();
        irisRtcConnection.xmpp = {
            "dummy": "dummy"
        }
        irisRtcSession.connection = irisRtcConnection;

        irisRtcSession.onSessionError = function(roomId, errorCode, errorMessage) {
            if (errorCode == RtcErrors.ERR_API_PARAMETERS &&
                errorMessage == "audioMuteToggle :: Invalid parameters") {
                done();
            }
        }

        irisRtcSession.audioMuteToggle("1234");

    });

    it('should throw error with roomId mismatch', (done) => {

        var irisRtcSession = new IrisRtcSession();
        irisRtcSession.config = {
            "roomId": "123"
        }
        var irisRtcConnection = new IrisRtcConnection();
        irisRtcConnection.xmpp = {
            "dummy": "dummy"
        }
        irisRtcSession.connection = irisRtcConnection;
        irisRtcSession.localStream = { "Stream": "stream" }

        irisRtcSession.onSessionError = function(roomId, errorCode, errorMessage) {
            if (errorCode == RtcErrors.ERR_API_PARAMETERS &&
                errorMessage == "audioMuteToggle :: Invalid parameters") {
                done();
            }
        }

        irisRtcSession.audioMuteToggle("1234");

    });

    after(() => {

    });

});


describe('IrisRtcSession.videoMuteToggle', () => {
    before(() => {

    });


    it('should throw error with no roomId', (done) => {

        var irisRtcSession = new IrisRtcSession();

        irisRtcSession.onSessionError = function(roomId, errorCode, errorMessage) {
            if (errorCode == RtcErrors.ERR_API_PARAMETERS &&
                errorMessage == "videoMuteToggle :: Invalid parameters") {
                done();
            }
        }

        irisRtcSession.videoMuteToggle("");

    });


    it('should throw error with no config in session', (done) => {

        var irisRtcSession = new IrisRtcSession();

        irisRtcSession.onSessionError = function(roomId, errorCode, errorMessage) {
            if (errorCode == RtcErrors.ERR_API_PARAMETERS &&
                errorMessage == "videoMuteToggle :: Invalid parameters") {
                done();
            }
        }

        irisRtcSession.videoMuteToggle("1234");

    });


    it('should throw error with no roomId in session config', (done) => {

        var irisRtcSession = new IrisRtcSession();
        irisRtcSession.config = {
            "conf": "conf"
        }

        irisRtcSession.onSessionError = function(roomId, errorCode, errorMessage) {
            if (errorCode == RtcErrors.ERR_API_PARAMETERS &&
                errorMessage == "videoMuteToggle :: Invalid parameters") {
                done();
            }
        }

        irisRtcSession.videoMuteToggle("1234");

    });

    it('should throw error with no connection in session', (done) => {

        var irisRtcSession = new IrisRtcSession();
        irisRtcSession.config = {
            "roomId": "123"
        }

        irisRtcSession.onSessionError = function(roomId, errorCode, errorMessage) {
            if (errorCode == RtcErrors.ERR_API_PARAMETERS &&
                errorMessage == "videoMuteToggle :: Invalid parameters") {
                done();
            }
        }

        irisRtcSession.videoMuteToggle("1234");

    });


    it('should throw error with no connection.xmpp in session', (done) => {

        var irisRtcSession = new IrisRtcSession();
        irisRtcSession.config = {
            "roomId": "123"
        }
        var irisRtcConnection = new IrisRtcConnection();
        irisRtcSession.connection = irisRtcConnection;

        irisRtcSession.onSessionError = function(roomId, errorCode, errorMessage) {
            if (errorCode == RtcErrors.ERR_API_PARAMETERS &&
                errorMessage == "videoMuteToggle :: Invalid parameters") {
                done();
            }
        }

        irisRtcSession.videoMuteToggle("1234");

    });

    it('should throw error with no localStream', (done) => {

        var irisRtcSession = new IrisRtcSession();
        irisRtcSession.config = {
            "roomId": "123"
        }
        var irisRtcConnection = new IrisRtcConnection();
        irisRtcConnection.xmpp = {
            "dummy": "dummy"
        }
        irisRtcSession.connection = irisRtcConnection;

        irisRtcSession.onSessionError = function(roomId, errorCode, errorMessage) {
            if (errorCode == RtcErrors.ERR_API_PARAMETERS &&
                errorMessage == "videoMuteToggle :: Invalid parameters") {
                done();
            }
        }

        irisRtcSession.videoMuteToggle("1234");

    });

    it('should throw error with roomId mismatch', (done) => {

        var irisRtcSession = new IrisRtcSession();
        irisRtcSession.config = {
            "roomId": "123"
        }
        var irisRtcConnection = new IrisRtcConnection();
        irisRtcConnection.xmpp = {
            "dummy": "dummy"
        }
        irisRtcSession.connection = irisRtcConnection;
        irisRtcSession.localStream = { "Stream": "stream" }

        irisRtcSession.onSessionError = function(roomId, errorCode, errorMessage) {
            if (errorCode == RtcErrors.ERR_API_PARAMETERS &&
                errorMessage == "videoMuteToggle :: Invalid parameters") {
                done();
            }
        }

        irisRtcSession.videoMuteToggle("1234");

    });

    after(() => {

    });

});



describe('IrisRtcSession.pstnHold', () => {
    before(() => {

    });

    it('should throw error with no roomId and no participantJid', (done) => {

        var irisRtcSession = new IrisRtcSession();

        irisRtcSession.onSessionError = function(roomId, errorCode, errorMessage) {
            if (errorCode == RtcErrors.ERR_API_PARAMETERS &&
                errorMessage == "pstnHold :: Invalid parameters") {
                done();
            }
        }

        irisRtcSession.pstnHold("", "");

    });


    it('should throw error with no roomId', (done) => {

        var irisRtcSession = new IrisRtcSession();

        irisRtcSession.onSessionError = function(roomId, errorCode, errorMessage) {
            if (errorCode == RtcErrors.ERR_API_PARAMETERS &&
                errorMessage == "pstnHold :: Invalid parameters") {
                done();
            }
        }

        irisRtcSession.pstnHold("", "participant");

    });


    it('should throw error with no participantJid', (done) => {

        var irisRtcSession = new IrisRtcSession();

        irisRtcSession.onSessionError = function(roomId, errorCode, errorMessage) {
            if (errorCode == RtcErrors.ERR_API_PARAMETERS &&
                errorMessage == "pstnHold :: Invalid parameters") {
                done();
            }
        }

        irisRtcSession.pstnHold("1234", "");

    });


    after(() => {

    });

});

describe('IrisRtcSession.pstnUnHold', () => {
    before(() => {

    });


    it('should throw error with no roomId and no participantJid', (done) => {

        var irisRtcSession = new IrisRtcSession();

        irisRtcSession.onSessionError = function(roomId, errorCode, errorMessage) {
            if (errorCode == RtcErrors.ERR_API_PARAMETERS &&
                errorMessage == "pstnUnHold :: Invalid parameters") {
                done();
            }
        }

        irisRtcSession.pstnUnHold("", "");

    });


    it('should throw error with no roomId', (done) => {

        var irisRtcSession = new IrisRtcSession();

        irisRtcSession.onSessionError = function(roomId, errorCode, errorMessage) {
            if (errorCode == RtcErrors.ERR_API_PARAMETERS &&
                errorMessage == "pstnUnHold :: Invalid parameters") {
                done();
            }
        }

        irisRtcSession.pstnUnHold("", "participant");

    });


    it('should throw error with no participantJid', (done) => {

        var irisRtcSession = new IrisRtcSession();

        irisRtcSession.onSessionError = function(roomId, errorCode, errorMessage) {
            if (errorCode == RtcErrors.ERR_API_PARAMETERS &&
                errorMessage == "pstnUnHold :: Invalid parameters") {
                done();
            }
        }

        irisRtcSession.pstnUnHold("1234", "");

    });


    after(() => {

    });

});


describe('IrisRtcSession.pstnMerge', () => {
    before(() => {

    });

    it('should throw error with no roomId, no firstParticipantJid, no secondSession and no secondParticipantJid', (done) => {

        var irisRtcSession = new IrisRtcSession();

        irisRtcSession.onSessionError = function(roomId, errorCode, errorMessage) {
            if (errorCode == RtcErrors.ERR_API_PARAMETERS &&
                errorMessage == "pstnMerge :: Invalid parameters") {
                done();
            }
        }

        irisRtcSession.pstnMerge("", "", "", "");

    });

    it('should throw error with no roomId', (done) => {

        var irisRtcSession = new IrisRtcSession();

        irisRtcSession.onSessionError = function(roomId, errorCode, errorMessage) {
            if (errorCode == RtcErrors.ERR_API_PARAMETERS &&
                errorMessage == "pstnMerge :: Invalid parameters") {
                done();
            }
        }

        irisRtcSession.pstnMerge("", "firstParticipantJid", "secondSession", "secondParticipantJid");

    });

    it('should throw error with no firstParticipantJid', (done) => {

        var irisRtcSession = new IrisRtcSession();

        irisRtcSession.onSessionError = function(roomId, errorCode, errorMessage) {
            if (errorCode == RtcErrors.ERR_API_PARAMETERS &&
                errorMessage == "pstnMerge :: Invalid parameters") {
                done();
            }
        }

        irisRtcSession.pstnMerge("roomId", "", "secondSession", "secondParticipantJid");

    });

    it('should throw error with no secondSession', (done) => {

        var irisRtcSession = new IrisRtcSession();

        irisRtcSession.onSessionError = function(roomId, errorCode, errorMessage) {
            if (errorCode == RtcErrors.ERR_API_PARAMETERS &&
                errorMessage == "pstnMerge :: Invalid parameters") {
                done();
            }
        }

        irisRtcSession.pstnMerge("roomId", "firstParticipantJid", "", "secondParticipantJid");

    });

    it('should throw error with no secondParticipantJid', (done) => {

        var irisRtcSession = new IrisRtcSession();

        irisRtcSession.onSessionError = function(roomId, errorCode, errorMessage) {
            if (errorCode == RtcErrors.ERR_API_PARAMETERS &&
                errorMessage == "pstnMerge :: Invalid parameters") {
                done();
            }
        }

        irisRtcSession.pstnMerge("roomId", "firstParticipantJid", "secondSession", "");

    });


    // it('should throw error with no participantJid', (done) => {

    //     var irisRtcSession = new IrisRtcSession();

    //     irisRtcSession.onSessionError = function(roomId, errorCode, errorMessage) {
    //         if (errorCode == RtcErrors.ERR_API_PARAMETERS &&
    //             errorMessage == "pstnMerge :: Invalid parameters") {
    //             done();
    //         }
    //     }

    //     irisRtcSession.pstnMerge("1234", "");

    // });


    after(() => {

    });

});


describe('IrisRtcSession.pstnHangup', () => {
    before(() => {

    });

    it('should throw error with no roomId, no firstParticipantJid', (done) => {

        var irisRtcSession = new IrisRtcSession();

        irisRtcSession.onSessionError = function(roomId, errorCode, errorMessage) {
            if (errorCode == RtcErrors.ERR_API_PARAMETERS &&
                errorMessage == "pstnHangup :: Invalid parameters") {
                done();
            }
        }

        irisRtcSession.pstnHangup("", "");

    });

    it('should throw error with no roomId', (done) => {

        var irisRtcSession = new IrisRtcSession();

        irisRtcSession.onSessionError = function(roomId, errorCode, errorMessage) {
            if (errorCode == RtcErrors.ERR_API_PARAMETERS &&
                errorMessage == "pstnHangup :: Invalid parameters") {
                done();
            }
        }

        irisRtcSession.pstnHangup("", "firstParticipantJid");

    });

    it('should throw error with no firstParticipantJid', (done) => {

        var irisRtcSession = new IrisRtcSession();

        irisRtcSession.onSessionError = function(roomId, errorCode, errorMessage) {
            if (errorCode == RtcErrors.ERR_API_PARAMETERS &&
                errorMessage == "pstnHangup :: Invalid parameters") {
                done();
            }
        }

        irisRtcSession.pstnHangup("1234", "");

    });

    after(() => {

    });

});



describe('IrisRtcSession.addPSTNParticipant', () => {
    before(() => {

    });

    it('should throw error with no roomId, no toTN, no routingId', (done) => {

        var irisRtcSession = new IrisRtcSession();

        irisRtcSession.onSessionError = function(roomId, errorCode, errorMessage) {
            if (errorCode == RtcErrors.ERR_API_PARAMETERS &&
                errorMessage == "addPSTNParticipant :: Invalid parameters") {
                done();
            }
        }

        irisRtcSession.addPSTNParticipant("", "", "");

    });

    it('should throw error with no roomId, no toTN', (done) => {

        var irisRtcSession = new IrisRtcSession();

        irisRtcSession.onSessionError = function(roomId, errorCode, errorMessage) {
            if (errorCode == RtcErrors.ERR_API_PARAMETERS &&
                errorMessage == "addPSTNParticipant :: Invalid parameters") {
                done();
            }
        }

        irisRtcSession.addPSTNParticipant("", "", "routingId");

    });

    it('should throw error with no roomId, no routingId', (done) => {

        var irisRtcSession = new IrisRtcSession();

        irisRtcSession.onSessionError = function(roomId, errorCode, errorMessage) {
            if (errorCode == RtcErrors.ERR_API_PARAMETERS &&
                errorMessage == "addPSTNParticipant :: Invalid parameters") {
                done();
            }
        }

        irisRtcSession.addPSTNParticipant("", "toTN", "");

    });

    it('should throw error with no toTN, no routingId', (done) => {

        var irisRtcSession = new IrisRtcSession();

        irisRtcSession.onSessionError = function(roomId, errorCode, errorMessage) {
            if (errorCode == RtcErrors.ERR_API_PARAMETERS &&
                errorMessage == "addPSTNParticipant :: Invalid parameters") {
                done();
            }
        }

        irisRtcSession.addPSTNParticipant("1234", "", "");

    });


    it('should throw error with no roomId', (done) => {

        var irisRtcSession = new IrisRtcSession();

        irisRtcSession.onSessionError = function(roomId, errorCode, errorMessage) {
            if (errorCode == RtcErrors.ERR_API_PARAMETERS &&
                errorMessage == "addPSTNParticipant :: Invalid parameters") {
                done();
            }
        }

        irisRtcSession.addPSTNParticipant("", "toTN", "routingId");

    });

    it('should throw error with no toTN', (done) => {

        var irisRtcSession = new IrisRtcSession();

        irisRtcSession.onSessionError = function(roomId, errorCode, errorMessage) {
            if (errorCode == RtcErrors.ERR_API_PARAMETERS &&
                errorMessage == "addPSTNParticipant :: Invalid parameters") {
                done();
            }
        }

        irisRtcSession.addPSTNParticipant("1234", "", "routingId");

    });

    it('should throw error with no routingId', (done) => {

        var irisRtcSession = new IrisRtcSession();

        irisRtcSession.onSessionError = function(roomId, errorCode, errorMessage) {
            if (errorCode == RtcErrors.ERR_API_PARAMETERS &&
                errorMessage == "addPSTNParticipant :: Invalid parameters") {
                done();
            }
        }

        irisRtcSession.addPSTNParticipant("1234", "toTN", "");

    });

    after(() => {

    });

});


describe('IrisRtcSession.sendDTMFTone', () => {
    before(() => {

    });

    it('should throw error with no roomId, no tone', (done) => {

        var irisRtcSession = new IrisRtcSession();

        irisRtcSession.onSessionError = function(roomId, errorCode, errorMessage) {
            if (errorCode == RtcErrors.ERR_API_PARAMETERS &&
                errorMessage == "sendDTMFTone :: Invalid parameters") {
                done();
            }
        }

        irisRtcSession.sendDTMFTone("", "", "", "");

    });

    it('should throw error with no roomId', (done) => {

        var irisRtcSession = new IrisRtcSession();

        irisRtcSession.onSessionError = function(roomId, errorCode, errorMessage) {
            if (errorCode == RtcErrors.ERR_API_PARAMETERS &&
                errorMessage == "sendDTMFTone :: Invalid parameters") {
                done();
            }
        }

        irisRtcSession.sendDTMFTone("", "tone", "", "");

    });

    it('should throw error with no tone', (done) => {

        var irisRtcSession = new IrisRtcSession();

        irisRtcSession.onSessionError = function(roomId, errorCode, errorMessage) {
            if (errorCode == RtcErrors.ERR_API_PARAMETERS &&
                errorMessage == "sendDTMFTone :: Invalid parameters") {
                done();
            }
        }

        irisRtcSession.sendDTMFTone("1234", "", "", "");

    });
    after(() => {

    });

});



// describe('IrisRtcSession.ModeratorControls', () => {
//     before(() => {

//     });

//     it('test case name', (done) => {

//     });

//     after(() => {

//     });

// });


// describe('Test suite name', () => {
//     before(() => {

//     });

//     it('test case name', (done) => {

//     });

//     after(() => {

//     });

// });
