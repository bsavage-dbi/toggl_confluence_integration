const chromep = new ChromePromise();

function getCurrentTabUrl(callback) {
    var queryInfo = {
        active: true,
        currentWindow: true
    };

    return chromep.tabs.query(queryInfo)
        .then(function (tabs) {
            return Promise.resolve(tabs[0].url);
        })
        .then(function (url) {
            console.assert(typeof url == 'string', 'tab.url should be a string');
            return url
        });
}

function selectJiraSummary() {
    var summary = document.getElementById('summary-val').innerText;
    console.log('Tab script: ' + summary);
    return summary;
}

function retrieveJiraSummary() {
    return chromep.tabs.executeScript({
        code: '(' + selectJiraSummary + ')();' //argument here is a string but function.toString() returns function's code
    }).then(function (results) {
        //Here we have just the innerHTML and not DOM structure
        console.log('Popup script:' + results[0]);
        return results[0];
    });
}

function saveApiToken() {
    var token = document.getElementById('personalApiKey').value;

    chromep.storage.sync.set({"token": token})
        .then(function () {
            alert('Saved token: ' + token)
        });
}

function getTogglAuthorizationHeader() {
    return chromep.storage.sync.get("token")
        .then(function (res) {
            return "Basic " + btoa(res.token + ':api_token');
        });
}

function startTimer() {
    var authorizationHeaderPromise = getTogglAuthorizationHeader();
    var projectIdPromise = lookUpProject();
    var taskDescriptionPromise = extractTaskDescription();
    var currentTimeEntryPromise = getCurrentTimeEntry();

    Promise.all([taskDescriptionPromise, projectIdPromise, authorizationHeaderPromise, currentTimeEntryPromise])
        .then(function (values) {
            console.log('Promise returned: ' + values);

            var taskDescription = values[0];
            var pid = values[1];
            var headerValue = values[2];
            var currentTimeEntry = values[3];

            if(currentTimeEntry && taskDescription === currentTimeEntry.description && pid === currentTimeEntry.pid){
                var currentElement = document.getElementById('current');
                currentElement.innerHTML = taskDescription;
                showMessage('Timer already started!');
            }else{

                new Promise(function (resolve, reject) {
                    var xhr = new XMLHttpRequest();
                    xhr.open("POST", "https://www.toggl.com/api/v8/time_entries/start", true);
                    xhr.setRequestHeader("Authorization", headerValue);
                    xhr.setRequestHeader("Content-type", "application/json");
                    xhr.onload = resolve;
                    xhr.onerror = reject;
                    var body = {
                        "time_entry": {
                            "description": taskDescription,
                            "created_with": "chrome ext",
                            "pid": pid,
                        }
                    };
                    xhr.send(JSON.stringify(body));

                }).then(function (e) {
                    console.log('start start success: ' + e.target.response);
                    return JSON.parse(e.target.response).data
                }, function (e) {
                    console.log('start start error: ' + e);
                }).then(function (timeEntry) {
                    var currentElement = document.getElementById('current');
                    currentElement.innerHTML = timeEntry.description;

                    showMessage('Timer started!');
                });
            }
        });
}

function startTimerFromProject(projectId) {
    var authorizationHeaderPromise = getTogglAuthorizationHeader();
    var currentTimeEntryPromise = getCurrentTimeEntry();

    Promise.all([authorizationHeaderPromise, currentTimeEntryPromise])
        .then(function (values) {
            console.log('Promise returned: ' + values);

            var headerValue = values[0];
            var currentTimeEntry = values[1];

            new Promise(function (resolve, reject) {
                var xhr = new XMLHttpRequest();
                xhr.open("POST", "https://www.toggl.com/api/v8/time_entries/start", true);
                xhr.setRequestHeader("Authorization", headerValue);
                xhr.setRequestHeader("Content-type", "application/json");
                xhr.onload = resolve;
                xhr.onerror = reject;
                var body = {
                    "time_entry": {
                        "created_with": "chrome ext",
                        "pid": projectId,
                    }
                };
                xhr.send(JSON.stringify(body));

            }).then(function (e) {
                console.log('start start success: ' + e.target.response);
                return JSON.parse(e.target.response).data
            }, function (e) {
                console.log('start start error: ' + e);
            }).then(addProjectDetails).then(function (timeEntry) {
                showMessage('Timer started!');
                setCurrentTask(timeEntry);
            });

        });
}

function lookUpProject() {
    var authorizationHeaderPromise = getTogglAuthorizationHeader();
    var workspaceIdPromise = getWorkspaceId();

    var projectsPromise = Promise.all([authorizationHeaderPromise, workspaceIdPromise])
        .then(function (values) {
            console.log('Promise returned: ' + values);

            var headerValue = values[0];
            var wid = values[1];

            return new Promise(function (resolve, reject) {
                var xhr = new XMLHttpRequest();
                xhr.open("GET", "https://www.toggl.com/api/v8/workspaces/" + wid + "/projects", true);
                xhr.setRequestHeader("Authorization", headerValue);
                xhr.onload = resolve;
                xhr.onerror = reject;
                xhr.send();
            }).then(function (e) {
                console.log('lookUpProject succes: ' + e.target.response);
                return JSON.parse(e.target.response)
            }, function (e) {
                console.log('lookUpProject error: ' + e);
            });

        });
    var currentTabUrlPromise = getCurrentTabUrl();

    return Promise.all([projectsPromise, currentTabUrlPromise])
        .then(function (values) {
            console.log('Promise returned: ' + values);

            var projects = values[0];
            var url = values[1];

            var currentProjectName = extractProjectName(url);
            if (currentProjectName) {

                var filtered = projects
                    .filter(function (project) {
                        return currentProjectName.toLowerCase() == project.name.toLowerCase();
                    });
                if (filtered.length == 0) {
                    showMessage('No Project found in toggle with name: ' + currentProjectName);

                    return Promise.reject(reason);
                } else {
                    return filtered[0].id;
                }
            }
            showMessage('Could not extract project name');

            return Promise.reject(reason);
        });
}

function showMessage(message) {
    var messageElement = document.getElementById('userMsg');
    messageElement.innerHTML = message;
    messageElement.classList.remove("hidden");
}

function hideMessage(message) {
    var messageElement = document.getElementById('userMsg');
    messageElement.classList.add("hidden");
    messageElement.innerHTML = '';
}

function lookUpProjectById(pid){
    return getTogglAuthorizationHeader()
        .then(function (headerValue) {
            return new Promise(function (resolve, reject) {
                var xhr = new XMLHttpRequest();
                xhr.open("GET", "https://www.toggl.com/api/v8/projects/"+pid, true);
                xhr.setRequestHeader("Authorization", headerValue);
                xhr.onload = resolve;
                xhr.onerror = reject;
                xhr.send();
            }).then(function (e) {
                console.log('lookUpProject succes: ' + e.target.response);
                return JSON.parse(e.target.response).data;
            }, function (e) {
                console.log('lookUpProject error: ' + e);
            });

        });
}

function extractProjectName(url) {
    //alert(url.indexOf('https://confluence.fluidda.com/display/'));
    if (url.indexOf('https://confluence.fluidda.com/display/') !== -1) {
        var spaceKey = url.split('/')[4];
        if(spaceKey.indexOf('x') == 4){ //if spaceKey contains 'x' instead of '_'
            spaceKey = spaceKey.substr(0,4)+'_'+spaceKey.substr(5);
        }
        return spaceKey;
    } else if (url.indexOf('https://jira.fluidda.com/projects/') !== -1) {
        return url.split('/')[4];
    } else if (url.indexOf('https://jira.fluidda.com/browse/') !== -1) {
        return url.split('/')[4].split('-')[0];
    } else {
        return null;
    }
}

function extractTaskDescription() {
    return getCurrentTabUrl()
        .then(function (url) {
            if (url.indexOf('https://confluence.fluidda.com/display/') !== -1) {
                var description = url.split('/')[5];
                return Promise.resolve(description);
            } else if (url.indexOf('https://jira.fluidda.com/browse/') !== -1) {
                return retrieveJiraSummary()
                    .then(function (summary) {
                        var description = url.split('/')[4];
                        if (summary) {
                            description = description + ': ' + summary;
                        }
                        return description;
                    });

            } else {
                var description = '(unknown)';
                return Promise.resolve(description);
            }
        });
}

function getCurrentTimeEntry() {
    return getTogglAuthorizationHeader()
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
            console.log('getCurrentTimeEntry succes: ' + e.target.response);
            return JSON.parse(e.target.response).data
        }, function (e) {
            console.log('getCurrentTimeEntry error: ' + e);
        });
}

function getCurrentTimeEntryWithProject() {
    return getCurrentTimeEntry().then(addProjectDetails);
}

function addProjectDetails(timeEntry) {
    return lookUpProjectById(timeEntry.pid).then(function (project) {
        timeEntry.project = project;
        return timeEntry;
    });
}

function getWorkspaceId() {
    return chromep.storage.sync.get("wid").then(function (data) {
        if (typeof data.wid === 'undefined') {
            alert('Not found in local storage')
            return getCurrentTimeEntry()
                .then(function (entry) {
                    if (entry) {
                        var workspaceId = entry.wid;
                        chromep.storage.sync.set({"wid": workspaceId});
                    }
                    return workspaceId;
                });
        } else {
            //alert('Found in local storage')
            return data.wid;
        }
    });
}

function getProjects() {
    var jiraProjectsPromise = getJiraProjects();
    var toggleProjectsPromise = getSortedToggleProjects();

    return Promise.all([jiraProjectsPromise, toggleProjectsPromise])
        .then(function (values) {
            var jiraProjects = values[0];
            var toggleProjects = values[1];
            var jiraProjectsNotInToggle = [];

            var sortedToggleProjectNames = toggleProjects.map(function (toggleProject){
                return toggleProject.name.toUpperCase();
            });

            for (var i = 0; i < jiraProjects.length; i++) {
                var index = sortedToggleProjectNames.indexOf(jiraProjects[i].key);
                if(index==-1){
                    jiraProjectsNotInToggle.push(jiraProjects[i]);
                }else{
                    toggleProjects[index].source = '+Jira+';
                }
            }

            return toggleProjects.concat(jiraProjectsNotInToggle);
        });
}

function getJiraProjects() {
    return new Promise(function (resolve, reject) {
        var xhr = new XMLHttpRequest();
        xhr.open("POST", "https://jira.fluidda.com/rest/userprojectrest/1/project");
        //xhr.setRequestHeader("Authorization", headerValue);
        xhr.setRequestHeader("Content-type", "application/json");
        xhr.onload = resolve;
        xhr.onerror = reject;
        var body = {"user": ["tomvr"], "permissions": ["WORK_ON_ISSUES"]};
        xhr.send(JSON.stringify(body));
    }).then(function (e) {
        console.debug('getJiraProjects success!');
        //console.debug('getJiraProjects success!' + e.target.response);
        return JSON.parse(e.target.response).tomvr
    }, function (e) {
        console.error('getJiraProjects error: ' + e);
    }).then(function (projects) {
        return projects.map(function (project) {
            return {jiraId: project.id, key: project.key, name: project.name, order: 999, source:'+Jira+'};
        });
    });
}

function getSortedToggleProjects() {
    return getTogglAuthorizationHeader()
        .then(function (headerValue) {
                return new Promise(function (resolve, reject) {
                    var endDate = new Date();
                    var startDate = new Date();
                    startDate.setDate(startDate.getDate() - 30);
                    var url = "https://www.toggl.com/api/v8/time_entries?start_date=" + startDate.toISOString() + "&end_date=" + endDate.toISOString();
                    console.log(url);
                    var xhr = new XMLHttpRequest();
                    xhr.open("GET", url);
                    xhr.setRequestHeader("Authorization", headerValue);
                    xhr.onload = resolve;
                    xhr.onerror = reject;
                    xhr.send();
                });
            }
        ).then(function (e) {
            console.log('getSortedToggleProjects success!');
            //console.debug(e.target.response);
            return JSON.parse(e.target.response)
        }, function (e) {
            console.log('getSortedToggleProjects error: ' + e);
        }).then(function (toggleProjects) {
            console.log(toggleProjects);
            return toggleProjects.map(function (project) {
                return project.pid;
            }).filter(function (value, index, self) {
                return self.indexOf(value) === index;
            });
        }).then(function (uniqueToggleProjectIds) {
            var projectNamePromises = [];

            for (var i = 0; i < uniqueToggleProjectIds.length; i++) {
                projectNamePromises.push(lookUpProjectById(uniqueToggleProjectIds[i]));
            }

            return Promise.all(projectNamePromises);
        }).then(function (toggleProjects) {
            return toggleProjects.map(function (toggleProject, index){
                return {id: toggleProject.id, name: toggleProject.name.toUpperCase(), order: index, source:'Toggle'};
            })
        });
}

function refreshCurrentTimeEntry() {
    getCurrentTimeEntryWithProject()
        .then(setCurrentTask);
}

function setCurrentTask(entry) {
    var messageElement = document.getElementById('current');
    var description = "<strong>" + entry.project.name + "</strong> ";
    if (entry.description) {
        description = description + entry.description
    }
    messageElement.innerHTML = description;
}

function createOnClick(projectid) {
    var pid = projectid;
    return function () {
        hideMessage();
        startTimerFromProject(pid);
    };
}

// This extension loads the saved background color for the current tab if one
// exists. The user can select a new background color from the dropdown for the
// current page, and it will be saved as part of the extension's isolated
// storage. The chrome.storage API is used for this purpose. This is different
// from the window.localStorage API, which is synchronous and stores data bound
// to a document's origin. Also, using chrome.storage.sync instead of
// chrome.storage.local allows the extension data to be synced across multiple
// user devices.
document.addEventListener('DOMContentLoaded', function () {

    var timerButton = document.getElementById('startTimer');
    timerButton.addEventListener('click', startTimer);

    var saveTokenButton = document.getElementById('saveKey');
    saveTokenButton.addEventListener('click', saveApiToken);

    refreshCurrentTimeEntry();

    extractTaskDescription().then(function (description) {
        var currentElement = document.getElementById('fromPage');
        currentElement.innerHTML = description;
    });

    getProjects()
        .then(function (projects) {
            var selectList = document.getElementById('projects');
            console.log(projects);
            for (var i = 0; i < projects.length; i++) {
                var option = document.createElement("option");
                var projectId = projects[i].id ? projects[i].id : projects[i].key;
                console.log(projectId);
                option.value = projectId;
                option.text = '['+projects[i].source+'] '+projects[i].name;
                option.onclick = createOnClick(projectId);
                selectList.appendChild(option);
            }
        });
});