// Copyright 2018 Comcast Cable Communications Management, LLC

var currentBrowser;
var browserVersion;

var RtcBrowserType = {

    BROWSER_CHROME: "Chrome",

    BROWSER_FIREFOX: "Firefox",

    BROWSER_OPERA: "Opera",

    BROWSER_SAFARI: "Safari",

    BROWSER_EDGE: "Edge",

    getBrowserType: function() {
        return currentBrowser;
    },

    isChrome: function() {
        return currentBrowser === RtcBrowserType.BROWSER_CHROME;
    },

    isFirefox: function() {
        return currentBrowser === RtcBrowserType.BROWSER_FIREFOX;
    },

    isOpera: function() {
        return currentBrowser === RtcBrowserType.BROWSER_OPERA;
    },

    isSafari: function() {
        return currentBrowser === RtcBrowserType.BROWSER_SAFARI;

    },

    isEdge: function() {
        return currentBrowser === RtcBrowserType.BROWSER_EDGE;

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
        currentBrowser = RtcBrowserType.BROWSER_CHROME;
        var userAgent = navigator.userAgent.toLowerCase();

        var ver = ""
        try {
            ver = parseInt(userAgent.match(/chrome\/(\d+)\./)[1], 10);
        } catch (error) {
            ver = 34; //For X1 case
        }
        return ver;
    }
    return null;
}

function detectOpera() {
    var userAgent = navigator.userAgent;
    if (userAgent.match(/Opera|OPR/)) {
        currentBrowser = RtcBrowserType.BROWSER_OPERA;
        var version = userAgent.match(/(Opera|OPR) ?\/?(\d+)\.?/)[2];
        return version;
    }
    return null;
}

function detectFirefox() {
    if (navigator.mozGetUserMedia) {
        currentBrowser = RtcBrowserType.BROWSER_FIREFOX;
        var version = parseInt(
            navigator.userAgent.match(/Firefox\/([0-9]+)\./)[1], 10);

        return version;
    }
    return null;
}

function detectSafari() {

    if (navigator.mediaDevices) {
        var userAgent = navigator.userAgent;
        var version = "";
        // navigator.userAgent.match(/Version\/[\d\.]+.*Safari/)

        if (navigator.userAgent.indexOf("Safari") > -1) {
            currentBrowser = RtcBrowserType.BROWSER_SAFARI;
            version = userAgent.substring(userAgent.indexOf('safari/') + 7);
            version = userAgent.substring(0, userAgent.indexOf('.'));
            return version;
        }
        return null;
    }

}

function detectEdge() {
    var version;
    var userAgent = window.navigator.userAgent;
    var edge = ua.indexOf('Edge/');

    if (!version && edge > 0) {
        version = parseInt(ua.substring(edge + 5, ua.indexOf('.', edge)), 10);
    }
    if (version) {
        currentBrowser = RtcBrowserType.BROWSER_EDGE;
    }

    return version;
}


function detectBrowser() {

    if (typeof window === 'undefined' || !window.navigator) {
        console.log("Check browser");
    }

    var version;
    var detectors = [
        //     detectOpera,
        detectChrome,
        detectFirefox,
        detectSafari
    ];
    // Try all browser detectors
    for (var i = 0; i < detectors.length; i++) {
        version = detectors[i]();
        if (version) {
            console.log("Browser : " + currentBrowser + " " + version);
            return version;
        }
    }

    //Browser default to chrome
    currentBrowser = RtcBrowserType.RTC_BROWSER_CHROME;
    return 1;
}

browserVersion = detectBrowser();

module.exports = RtcBrowserType;
