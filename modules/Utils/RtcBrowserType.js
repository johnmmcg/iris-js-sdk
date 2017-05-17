// Copyright 2016 Comcast Cable Communications Management, LLC

var currentBrowser;
var browserVersion;

var RtcBrowserType = {

    RTC_BROWSER_CHROME: "chrome",

    RTC_BROWSER_FIREFOX: "firefox",

    RTC_BROWSER_OPERA: "opera",

    getBrowserType: function() {
        return currentBrowser;
    },

    isChrome: function() {
        return currentBrowser === RtcBrowserType.RTC_BROWSER_CHROME;
    },

    isFirefox: function() {
        return currentBrowser === RtcBrowserType.RTC_BROWSER_FIREFOX;
    },

    isOpera: function() {
        return currentBrowser === RtcBrowserType.RTC_BROWSER_OPERA;
    },

    getFirefoxVersion: function() {
        return RtcBrowserType.isFirefox() ? browserVersion : null;
    },

    getChromeVersion: function() {
        return RtcBrowserType.isChrome() ? browserVersion : null;
    },

}

function detectChrome() {
    if (navigator.webkitGetUserMedia) {
        currentBrowser = RtcBrowserType.RTC_BROWSER_CHROME;
        var userAgent = navigator.userAgent.toLowerCase();
        // We can assume that user agent is chrome, because it's
        // enforced when 'ext' streaming method is set
        // var ver = parseInt(userAgent.match(/chrome\/(\d+)\./)[1], 10);
        var ver = 34;
        return ver;
    }
    return null;
}

function detectOpera() {
    var userAgent = navigator.userAgent;
    if (userAgent.match(/Opera|OPR/)) {
        currentBrowser = RtcBrowserType.RTC_BROWSER_OPERA;
        var version = userAgent.match(/(Opera|OPR) ?\/?(\d+)\.?/)[2];
        return version;
    }
    return null;
}

function detectFirefox() {
    if (navigator.mozGetUserMedia) {
        currentBrowser = RtcBrowserType.RTC_BROWSER_FIREFOX;
        var version = parseInt(
            navigator.userAgent.match(/Firefox\/([0-9]+)\./)[1], 10);
        return version;
    }
    return null;
}

function detectBrowser() {
    var version;
    var detectors = [
        //     detectOpera,
        detectChrome,
        detectFirefox,
    ];
    // Try all browser detectors
    for (var i = 0; i < detectors.length; i++) {
        version = detectors[i]();
        if (version)
            return version;
    }

    //Browser default to chrome
    currentBrowser = RtcBrowserType.RTC_BROWSER_CHROME;
    return 1;
}

browserVersion = detectBrowser();

module.exports = RtcBrowserType;