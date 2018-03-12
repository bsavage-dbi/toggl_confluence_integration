// Copyright (c) 2014 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

const chromep = new ChromePromise();

/**
 * Get the current URL.
 *
 * @param {function(string)} callback called when the URL of the current tab
 *   is found.
 */
function getCurrentTabUrl(callback) {
    // Query filter to be passed to chrome.tabs.query - see
    // https://developer.chrome.com/extensions/tabs#method-query
    var queryInfo = {
        active: true,
        currentWindow: true
    };

    return chromep.tabs.query(queryInfo)
        .then((tabs) => {
            return Promise.resolve(tabs[0].url);})
        .then(function (url) {
            console.assert(typeof url == 'string', 'tab.url should be a string');
            return url});
}

/**
 * Change the background color of the current page.
 *
 * @param {string} color The new background color.
 */
function changeBackgroundColor(color) {
  var script = 'document.body.style.backgroundColor="' + color + '";';
  // See https://developer.chrome.com/extensions/tabs#method-executeScript.
  // chrome.tabs.executeScript allows us to programmatically inject JavaScript
  // into a page. Since we omit the optional first argument "tabId", the script
  // is inserted into the active tab of the current window, which serves as the
  // default.
  chrome.tabs.executeScript({
    code: script
  });
}

function selectJiraSummary(){
    console.log('Tab script:');
    return document.getElementById('summary-val').value;
}

function retrieveJiraSummary(){
    chrome.tabs.executeScript({
        code: '(' + selectJiraSummary + ')();' //argument here is a string but function.toString() returns function's code
    }, (results) => {
        //Here we have just the innerHTML and not DOM structure
        console.log('Popup script:')
        console.log(results[0]);
    });
}

/**
 * Gets the saved background color for url.
 *
 * @param {string} url URL whose background color is to be retrieved.
 * @param {function(string)} callback called with the saved background color for
 *     the given url on success, or a falsy value if no color is retrieved.
 */
function getSavedBackgroundColor(url, callback) {
  // See https://developer.chrome.com/apps/storage#type-StorageArea. We check
  // for chrome.runtime.lastError to ensure correctness even when the API call
  // fails.
  chrome.storage.sync.get(url, (items) => {
    callback(chrome.runtime.lastError ? null : items[url]);
  });
}

/**
 * Sets the given background color for url.
 *
 * @param {string} url URL for which background color is to be saved.
 * @param {string} color The background color to be saved.
 */
function saveBackgroundColor(url, color) {
  var items = {};
  items[url] = color;
  // See https://developer.chrome.com/apps/storage#type-StorageArea. We omit the
  // optional callback since we don't need to perform any action once the
  // background color is saved.
  chrome.storage.sync.set(items);
}

function saveApiToken(){
	var token = document.getElementById('personalApiKey').value;

    chromep.storage.sync.set({"token": token})
        .then(function () {console.log('Saved token: ' + token)  });
}

function getAuthorizationHeader() {
    return chromep.storage.sync.get("token")
        .then(function (res) {
            return "Basic " + btoa(res.token + ':api_token');
        });
}

function setAuthorizationHeader(xhr) {
    return getAuthorizationHeader().then(function (headerValue) {
        xhr.setRequestHeader("Authorization", headerValue);
    });
}

function startTimer() {
	//alert("Hello, world!1");
	var xhr = new XMLHttpRequest();
	xhr.open("POST", "https://www.toggl.com/api/v8/time_entries/start", true);	
	xhr.setRequestHeader("Content-type", "application/json");
	setAuthorizationHeader(xhr).then(function(){

        xhr.onreadystatechange = function() {

          if (xhr.readyState == 4) {
            var messageElement = document.getElementById('userMsg');
            messageElement.innerHTML = 'Timer started! ' + JSON.parse(xhr.responseText).data.description;
          }
        };
        getCurrentTabUrl().then(function (url) {
            lookUpProject((pid) => {
                var body = {
                    "time_entry": {
                        "description": extractTaskDescription(url),
                        "created_with": "chrome ext",
                        "pid": pid,
                    }
                };
                //alert('sending body:' +body);
                xhr.send(JSON.stringify(body));
            });
        });
    });
}

function lookUpProject(callback){
	getWorkspaceId().then( function(wid){
		var xhr = new XMLHttpRequest();
		xhr.open("GET", "https://www.toggl.com/api/v8/workspaces/"+wid+"/projects", true);	
		
		setAuthorizationHeader(xhr).then(function(){
            xhr.onreadystatechange = function() {
                if (xhr.readyState == 4) {
                    var projects = JSON.parse(xhr.responseText);
                    //alert('found projects:' + projects);

                    getCurrentTabUrl().then(function (url) {
                        var currentProjectName = extractProjectName(url);
                        if(currentProjectName){

                            var filtered = projects.filter((project) => {
                                return currentProjectName.toLowerCase() == project.name.toLowerCase();
                            });
                            if(filtered.length==0){
                                alert('No Project found in toggle with name: '+ currentProjectName);
                            }else{
                                callback(filtered[0].id);
                            }
                        }
                    });
                }
            };
            xhr.send();
        });
	} );		
	
}

function extractProjectName(url){
	//alert(url.indexOf('https://confluence.fluidda.com/display/'));
	if(url.indexOf('https://confluence.fluidda.com/display/') !== -1){
		return url.split('/')[4];
	}else if(url.indexOf('https://jira.fluidda.com/projects/') !== -1){
		return url.split('/')[4];
	}else if(url.indexOf('https://jira.fluidda.com/browse/') !== -1){
		return url.split('/')[4].split('-')[0];
	}else{
		return null;
	}
}

function extractTaskDescription(url){
	if(url.indexOf('https://confluence.fluidda.com/display/') !== -1){
		return url.split('/')[5];
	}else if(url.indexOf('https://jira.fluidda.com/browse/') !== -1){
        //selectJiraSummary();
		return url.split('/')[4];
	}else{
		return null;
	}
}

function getCurrentTimeEntry() {
    return getAuthorizationHeader()
        .then(function (headerValue) {
            return new Promise(function (resolve, reject) {
                var xhr = new XMLHttpRequest();
                xhr.open("GET", "https://www.toggl.com/api/v8/time_entries/current");
                xhr.setRequestHeader("Authorization", headerValue);
                xhr.onload = resolve;
                xhr.onerror = reject;
                xhr.send();
            });
        }
    ).then(function (e) {
        console.log('succes: '+e.target.response);
        return JSON.parse(e.target.response).data
    }, function (e) {
        console.log('error: '+e);
    });
}

function getWorkspaceId() {
	return chromep.storage.sync.get("wid").then(function(data) {
		if (typeof data.wid === 'undefined') {
			alert('Not found in local storage')
			return getCurrentTimeEntry()
                .then(function(entry){
                    if(entry){
                        var workspaceId = entry.wid;
                        chromep.storage.sync.set({"wid": workspaceId});
                    }
                    return workspaceId;
				} );
		} else {
			//alert('Found in local storage')
            return data.wid;
		}
	});	
}

// This extension loads the saved background color for the current tab if one
// exists. The user can select a new background color from the dropdown for the
// current page, and it will be saved as part of the extension's isolated
// storage. The chrome.storage API is used for this purpose. This is different
// from the window.localStorage API, which is synchronous and stores data bound
// to a document's origin. Also, using chrome.storage.sync instead of
// chrome.storage.local allows the extension data to be synced across multiple
// user devices.
document.addEventListener('DOMContentLoaded', () => {  
  
	getCurrentTabUrl().then(function (url) {
	  
		var timerButton = document.getElementById('startTimer');
		timerButton.addEventListener('click', startTimer); 
		
		var saveTokenButton = document.getElementById('saveKey');
		saveTokenButton.addEventListener('click', saveApiToken); 
		
		var workspaceIdInput = document.getElementById('workspaceId');
		getWorkspaceId()
            .then(function(wid){
				workspaceIdInput.value = wid;					
			} );		
		
	});
	
	getCurrentTimeEntry()
        .then(function(entry){
            var messageElement = document.getElementById('userMsg');
            messageElement.innerHTML = entry.description;
        });
});