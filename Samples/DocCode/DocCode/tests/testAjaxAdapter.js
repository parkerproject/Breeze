﻿/**************************************************************
 A test 'ajax' adapter class whose instance can monitor a base ajax adapter
 with 'before', 'afterSuccess', 'afterError' methods and 
 synchronously return a canned response for a given request url.

 You can supply any number of canned responses. Each has a url pattern which
 is compared with the ajax request url. The first matching response becomes
 the faked response of the ajax request.

 If none of the response match but there is a default response, 
 the default becomes the faked response of the ajax request.

 If there still is no canned response, the request is forwarded to
 the 'ajax' function of the base adapter.
 
 After instantiating a test adapter, call its enable() method to enable its injection into the
 base ajax adapter. Call its disable() method to restore the pre-injection behavior.

 The constructor takes an optional 'config' object and optional 'adaptername'
  
    @param [adapterName] {String} The name of the ajax adapter to hijack. Hijacks the default adapter by default.

    @param [config] {Object} The optional "TestAdapterConfig" hash. All of its members are optional. 
    
    Adapter behavior is driven by this configuration object which can be supplied
    during instantiation and/or modified/reset later via the adapter's testAdapterConfig property.

    @param [config.defaultResponse] {Object} Response to return if there is no match with the ajax config.url
        @param [config.defaultResponse.data] {Object} Faked JSON data
        @param [config.defaultResponse.statusText="200 - OK"]: {String} Faked status text
        @param [config.defaultResponse.responseText]: {String} Faked XHR.responseText
        @param [config.defaultResponse.status=200]: {Number} Faked XHR.status, the HTTP status Code
        @param [config.defaultResponse.xhr] {Object} Faked XHR object as if returned by base ajax adapter 
        @param [config.defaultResponse.isError] {Boolean} true if should treat this call as an error.
        The test adapter follows the "success path" (calls ajaxConfig.Success) if 'isError' is false and the
        status is a 200. Otherwise it follows the "error path" (calls ajaxConfig.error).
        @param [config.defaultResponse.errorThrown] {Error} Faked exception as if returned by base ajax adapter 

    @param [config.responses] {Array of Object} Each response is as defined for default response 
    with an additional 'url' property, a {String} url pattern to match the response to the ajax config.url.
    The adapter picks the first response with a matching url pattern.
    @param [config.urlMatcher] {Function} Returns true if a response.url matches the ajax config.url. 
    Default matcher is a RegEx matcher that treats the response.url as a RegExp pattern.
    @param [config.before] {Function} Something to do before the ajax operation begins
    @param [config.afterSuccess] {Function} Something to do after the ajax operation returns a successful result
    @param [config.afterAfter] {Function} Something to do after the ajax operation returns with an error

    @param [config] {Array} This is a convenience version of the TestAdapterConfig which the adapter translates to
    a config that returns the array as the successful (StatusCode 200) data result for any requested URL.

    before(origAjaxConfig, response)
    @param origAjaxConfig {Object) The original ajax configuation parameter from the caller
    @param [response] {Object} The test response object if there is one. 

    afterSuccess(origAjaxConfig, response, data, textStatus, xhr);
    @param origAjaxConfig {Object) The original ajax configuation parameter from the caller
    @param [response] {Object} The test response object if there was one. 
    @param data {Object} Data returned from the base adapter or faked. 
    @param textStatus {String} Text status returned from the base adapter or faked. 
    @param xhr {Object} XHR object returned from the base adapter or faked. 

    afterError(origAjaxConfig, response, xhr, textStatus, errorThrown);
    @param origAjaxConfig {Object) The original ajax configuation parameter from the caller
    @param [response] {Object} The test response object if there was one.
    @param xhr {Object} XHR object returned from the base adapter or faked. 
    @param textStatus {String} Text status returned from the base adapter or faked. 
    @param errorThrown {Error} The exception returned from the base adapter or faked. 

    urlMatcher(url, pattern)
    @param url {String} the ajax config.url
    @param pattern {String} the pattern defined in the response.url
    @return {Boolean} true if the response matches this url

 *************************************************************/
docCode.TestAjaxAdapter = (function() {

    var TestAjaxAdapter = function (config, adapterName) {
        this.testAdapterConfig = config;  
        
        this.enable = function () { adapter.ajax = fakeAjaxFn; };

        this.disable = function() { adapter.ajax = origAjaxFn; };
       
        //#region private variables     
        var adapter = breeze.config.getAdapterInstance("ajax", adapterName);
        if (!adapter) {
            throw new Error("No existing " + adapterName + " ajax adapter to fake.");
        }
        var fakeAjaxFn = createFakeAjaxFn(this);
        var origAjaxFn = adapter.ajax;
        //#endregion
    };

    return TestAjaxAdapter;
    
    //#region private functions
    function createFakeAjaxFn(testAdapter) {

        return function (origAjaxConfig) {
            var ajaxConfig = breeze.core.extend({}, origAjaxConfig); // clone config

            var adapterConfig = getAdapterConfig(testAdapter.testAdapterConfig);

            var before = adapterConfig.before || noop;
            var afterSuccess = adapterConfig.afterSuccess || noop;
            var afterError = adapterConfig.afterError || noop;


            // look for a fake response for this url
            // TODO: use regex to match url!
            var response = matchResponse(ajaxConfig.url, adapterConfig.responses, adapterConfig.urlMatcher);
            response = response || adapterConfig.defaultResponse;

            // wrap success and fail fns
            var origSuccessFn = origAjaxConfig.success || noop;
            ajaxConfig.success = function(data, textStatus, xhr) {
                afterSuccess(origAjaxConfig, response, data, textStatus, xhr);
                origSuccessFn(data, textStatus, xhr);
            };
            var origErrorFn = origAjaxConfig.error || noop;
            ajaxConfig.error = function(xhr, textStatus, errorThrown) {
                afterError(origAjaxConfig, response, xhr, textStatus, errorThrown);
                origErrorFn(xhr, textStatus, errorThrown);
            };

            before(origAjaxConfig, response);

            if (!response) {
                // no applicable fake response; pass thru to original ajax fn
                this.origAjaxFn(ajaxConfig);
            }

            // Using fakeResponse
            var fakeXhr = {
                statusText: response.statusText || "200 - OK",
                responseText: response.responseText || "",
                status: response.status || 200
            };
            if (response.xhr) {
                fakeXhr = breeze.core.extend(xhr, response.xhr);
            }
            var fakeTextStatus = response.textStatus || fakeXhr.statusText;

            if (response.isError || fakeXhr.status < 200 || fakeXhr.status >= 300) {
                var fakeErrorThrown = response.errorThrown || new Error("fake ajax error");
                ajaxConfig.error(fakeXhr, fakeTextStatus, fakeErrorThrown);
            } else {
                var fakeData = response.data || [];
                ajaxConfig.success(fakeData, fakeTextStatus, fakeXhr);
            }
        };
    }
    
    function getAdapterConfig(adapterConfig) {
        if (adapterConfig === undefined || adapterConfig === null) {
            return {};
        } else if (isArray(adapterConfig)) {
            // Assume a simple array is a simple adapterConfig specifying
            // the JSON results to return for any URL
            return { defaultResponse: { data: adapterConfig } };
        } else if (isObject(adapterConfig)) {
            return adapterConfig;
        } else {
            throw new Error("TestAdapterConfig must be an object or an array of JSON results");
        }
    }
 
    function isArray(thing) {
        return Object.prototype.toString.call(thing) === "[object Array]";
    }
    
    function isObject(thing) {
        return Object.prototype.toString.call(thing) === "[object Object]";
    }
    
    function matchResponse(url, responses, urlMatcher) {
        if (!responses || !url) { return null; }
        if (!breeze.core.isArray(responses)) { responses = [responses]; }
        urlMatcher = urlMatcher || regExUrlMatcher;

        for (var i = 0, len = responses.length; i < len; i++) {
            try {
                var response = responses[i];
                if (urlMatcher(url, response.url)) {
                    return response;
                }
            } catch (ex) {/* match failed; skip to the next response */ }
        }
        return null;
    }

    function regExUrlMatcher(url, pattern) {
        return (new RegExp(pattern)).test(url);
    }

    function noop() { }
    
    //#endregion

})();