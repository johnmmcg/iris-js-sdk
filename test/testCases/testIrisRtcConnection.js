// Test Iris Rtc Connection API's

require('../TestConfig')

var RtcErrors = IrisRtcErrors.code;

describe('IrisRtcConnection.connect', () => {
    before(() => {

    });

    it('should throw error with no irisToken no routingId', (done) => {

        var irisRtcConnection = new IrisRtcConnection();

        irisRtcConnection.onConnectionError = function(errorCode, errorMessage) {
            if (errorCode == RtcErrors.ERR_INCORRECT_PARAMETERS &&
                errorMessage == "Invalid parameters") {
                done();
            }
        }

        irisRtcConnection.connect("", "", "");

    });


    it('should throw error with no routingId', (done) => {

        var irisRtcConnection = new IrisRtcConnection();

        irisRtcConnection.onConnectionError = function(errorCode, errorMessage) {
            if (errorCode == RtcErrors.ERR_INCORRECT_PARAMETERS &&
                errorMessage == "Invalid parameters") {
                done();
            }
        }

        irisRtcConnection.connect("irisToken", "", "");

    });


    it('should throw error with no irisToken', (done) => {

        var irisRtcConnection = new IrisRtcConnection();

        irisRtcConnection.onConnectionError = function(errorCode, errorMessage) {
            if (errorCode == RtcErrors.ERR_INCORRECT_PARAMETERS &&
                errorMessage == "Invalid parameters") {
                done();
            }
        }

        irisRtcConnection.connect("", "routingId", "");

    });


    it('should throw error with no evm url ', (done) => {

        var irisRtcConnection = new IrisRtcConnection();

        irisRtcConnection.onConnectionError = function(errorCode, errorMessage) {
            if (errorCode == RtcErrors.ERR_INCORRECT_PARAMETERS &&
                errorMessage == "Event Manager Url not found") {
                done();
            }
        }

        irisRtcConnection.connect("irisToken", "routingId", "");

    });


    it('should throw error with evm url and failed in creating connection', (done) => {

        var irisRtcConnection = new IrisRtcConnection();

        irisRtcConnection.onConnectionError = function(errorCode, errorMessage) {
            if (errorCode == RtcErrors.ERR_CREATE_CONNECTION_FAILED) {
                done();
            }
        }

        irisRtcConnection.connect("irisToken", "routingId", "evm.iris.comcast.net");

    });

    after(() => {

    });

});


// describe('Test suite name', () => {
//     before(() => {

//     });

//     it('test case name', (done) => {

//     });

//     after(() => {

//     });

// });