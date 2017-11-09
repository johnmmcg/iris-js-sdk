// Test Iris Rtc Stream API's 

require('../TestConfig')

var RtcErrors = IrisRtcErrors.code;

describe('IrisRtcStream.createStream', () => {
    before(() => {

    });

    it('should throw error with no streamConfig', (done) => {

        var irisRtcStream = new IrisRtcStream();

        irisRtcStream.onStreamError = function(errorCode, errorMessage) {
            if (errorCode == RtcErrors.ERR_INCORRECT_PARAMETERS &&
                errorMessage == "Invalid parameters") {
                done();
            }
        }

        irisRtcStream.createStream("");

    });


    it('should throw error with streamConfig having no valid params', (done) => {

        var irisRtcStream = new IrisRtcStream();

        irisRtcStream.onStreamError = function(errorCode, errorMessage) {
            if (errorCode == RtcErrors.ERR_INCORRECT_PARAMETERS &&
                errorMessage == "Invalid parameters") {
                done();
            }
        }

        irisRtcStream.createStream({ "Hello": "hello" });

    });


    it('should throw error with no constraints and wrong streamType', (done) => {

        var irisRtcStream = new IrisRtcStream();

        irisRtcStream.onStreamError = function(errorCode, errorMessage) {
            if (errorCode == RtcErrors.ERR_INCORRECT_PARAMETERS &&
                errorMessage == "Invalid parameters") {
                done();
            }
        }

        irisRtcStream.createStream({ "streamType": "hello" });

    });

    it('should throw error with no streamType and constraints with no audio and video', (done) => {

        var irisRtcStream = new IrisRtcStream();

        irisRtcStream.onStreamError = function(errorCode, errorMessage) {
            if (errorCode == RtcErrors.ERR_INCORRECT_PARAMETERS &&
                errorMessage == "Invalid parameters") {
                done();
            }
        }

        irisRtcStream.createStream({ "constraints": "hello" });

    });


    it('should throw error with no streamType and constraints with no audio and video as empty', (done) => {

        var irisRtcStream = new IrisRtcStream();

        irisRtcStream.onStreamError = function(errorCode, errorMessage) {
            if (errorCode == RtcErrors.ERR_INCORRECT_PARAMETERS &&
                errorMessage == "Invalid parameters") {
                done();
            }
        }

        irisRtcStream.createStream({ "constraints": { "video": "" } });

    });

    it('should throw error with no streamType and constraints with no video and audio as empty', (done) => {

        var irisRtcStream = new IrisRtcStream();

        irisRtcStream.onStreamError = function(errorCode, errorMessage) {
            if (errorCode == RtcErrors.ERR_INCORRECT_PARAMETERS &&
                errorMessage == "Invalid parameters") {
                done();
            }
        }

        irisRtcStream.createStream({ "constraints": { "audio": "" } });

    });

    it('should throw error with no streamType and constraints with no audio and video as empty', (done) => {

        var irisRtcStream = new IrisRtcStream();

        irisRtcStream.onStreamError = function(errorCode, errorMessage) {
            if (errorCode == RtcErrors.ERR_INCORRECT_PARAMETERS &&
                errorMessage == "Invalid parameters") {
                done();
            }
        }

        irisRtcStream.createStream({ "constraints": { "video": false } });

    });

    it('should throw error with no streamType and constraints with no video and audio as empty', (done) => {

        var irisRtcStream = new IrisRtcStream();

        irisRtcStream.onStreamError = function(errorCode, errorMessage) {
            if (errorCode == RtcErrors.ERR_INCORRECT_PARAMETERS &&
                errorMessage == "Invalid parameters") {
                done();
            }
        }

        irisRtcStream.createStream({ "constraints": { "audio": false } });

    });

    it('should throw error with no streamType and constraints with video true but fails in getusermedia', (done) => {

        var irisRtcStream = new IrisRtcStream();

        irisRtcStream.onStreamError = function(errorCode, errorMessage) {
            if (errorCode == RtcErrors.ERR_CREATE_STREAM_FAILED &&
                errorMessage == "Failed to create stream") {
                done();
            }
        }

        irisRtcStream.createStream({ "constraints": { "video": true } });

    });

    it('should throw error with no streamType and constraints with audio true but fails in getusermedia', (done) => {

        var irisRtcStream = new IrisRtcStream();

        irisRtcStream.onStreamError = function(errorCode, errorMessage) {
            if (errorCode == RtcErrors.ERR_CREATE_STREAM_FAILED &&
                errorMessage == "Failed to create stream") {
                done();
            }
        }

        irisRtcStream.createStream({ "constraints": { "audio": true } });

    });


    it('should throw error with no constraints and streamType as audio but fails in getusermedia', (done) => {

        var irisRtcStream = new IrisRtcStream();

        irisRtcStream.onStreamError = function(errorCode, errorMessage) {
            if (errorCode == RtcErrors.ERR_CREATE_STREAM_FAILED &&
                errorMessage == "Failed to create stream") {
                done();
            }
        }

        irisRtcStream.createStream({ "streamType": "audio" });

    });


    it('should throw error with no constraints and streamType as video but fails in getusermedia', (done) => {

        var irisRtcStream = new IrisRtcStream();

        irisRtcStream.onStreamError = function(errorCode, errorMessage) {
            if (errorCode == RtcErrors.ERR_CREATE_STREAM_FAILED &&
                errorMessage == "Failed to create stream") {
                done();
            }
        }

        irisRtcStream.createStream({ "streamType": "video" });

    });

    after(() => {

    });

});


describe('IrisRtcStream.stopMediaStream', () => {
    before(() => {

    });

    it('should throw error with no media stream', (done) => {

        var irisRtcStream = new IrisRtcStream();

        irisRtcStream.onStreamError = function(errorCode, errorMessage) {
            if (errorCode == RtcErrors.ERR_API_PARAMETERS &&
                errorMessage == "Media stream is null") {
                done();
            }
        }

        irisRtcStream.stopMediaStream("");

    });

    after(() => {

    });

});