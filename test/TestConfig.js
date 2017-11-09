require('./setup');
require("../iris-js-sdk.min.js");

IrisRtcConfig.updateConfig({
    logLevel: -1,
    urls: {
        eventManager: ""
    }
});