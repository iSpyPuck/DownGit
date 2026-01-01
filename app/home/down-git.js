/***********************************************************
* Developer: Minhas Kamal (minhaskamal024@gmail.com)       *
* Website: https://github.com/MinhasKamal/DownGit          *
* License: MIT License                                     *
***********************************************************/

var downGitModule = angular.module('downGitModule', [
]);

downGitModule.factory('downGitService', [
    '$http',
    '$q',

    function ($http, $q) {
        var repoInfo = {};

        var parseInfo = function(parameters) {
            var repoPath = new URL(parameters.url).pathname;
            var splitPath = repoPath.split("/");
            var info = {};

            info.author = splitPath[1];
            info.repository = splitPath[2];
            
            // splitPath[3] can be 'tree', 'blob', or empty
            // splitPath[4] is the branch name
            info.pathType = splitPath[3]; // 'tree' for directories, 'blob' for files
            info.branch = splitPath[4];

            info.rootName = splitPath[splitPath.length-1];
            if(!!splitPath[4]){
                info.resPath = repoPath.substring(
                    repoPath.indexOf(splitPath[4])+splitPath[4].length+1
                );
            }
            info.urlPrefix = "https://api.github.com/repos/"+
                info.author+"/"+info.repository+"/contents/";
            info.urlPostfix = "?ref="+info.branch;

            if(!parameters.fileName || parameters.fileName==""){
                info.downloadFileName = info.rootName;
            } else{
                info.downloadFileName = parameters.fileName;
            }

            if(parameters.rootDirectory=="false"){
                info.rootDirectoryName = "";

            } else if(!parameters.rootDirectory || parameters.rootDirectory=="" ||
                parameters.rootDirectory=="true"){
                info.rootDirectoryName = info.rootName+"/";

            } else{
                info.rootDirectoryName = parameters.rootDirectory+"/";
            }

            return info;
        }

        var downloadDir = function(progress){
            progress.isProcessing.val = true;

            var dirPaths = [];
            var files = [];
            var requestedPromises = [];

            dirPaths.push(repoInfo.resPath);
            mapFileAndDirectory(dirPaths, files, requestedPromises, progress);
        }

        var mapFileAndDirectory = function(dirPaths, files, requestedPromises, progress){
            $http.get(repoInfo.urlPrefix+dirPaths.pop()+repoInfo.urlPostfix).then(function(response) {
                for(var i=response.data.length-1; i>=0; i--){
                    if(response.data[i].type=="dir"){
                        dirPaths.push(response.data[i].path);

                    } else{
                        if(response.data[i].download_url){
                            getFile(response.data[i].path,
                                response.data[i].download_url,
                                files, requestedPromises, progress
                            );
                        } else {
                            console.log(response.data[i]);
                        }
                    }
                }

                if(dirPaths.length<=0){
                    downloadFiles(files, requestedPromises, progress);
                } else{
                    mapFileAndDirectory(dirPaths, files, requestedPromises, progress);
                }
            });
        }

        var downloadFiles = function(files, requestedPromises, progress){
            var zip = new JSZip();
            $q.all(requestedPromises).then(function(data) {
                for(var i=files.length-1; i>=0; i--){
                    zip.file(
                        repoInfo.rootDirectoryName+files[i].path.substring(decodeURI(repoInfo.resPath).length+1),
                        files[i].data
                    );
                }

                progress.isProcessing.val=false;
                zip.generateAsync({type:"blob"}).then(function(content) {
                    saveAs(content, repoInfo.downloadFileName+".zip");
                });
            });
        }

        var getFile = function (path, url, files, requestedPromises, progress) {
            var promise = $http.get(url, {responseType: "arraybuffer"}).then(function (file) {
                files.push({path:path, data:file.data});
                progress.downloadedFiles.val = files.length;
            }, function(error) {
                console.log(error);
            });

            requestedPromises.push(promise);
            progress.totalFiles.val = requestedPromises.length;
        }

        var downloadFile = function (url, progress, toastr) {
            progress.isProcessing.val=true;
            progress.downloadedFiles.val = 0;
            progress.totalFiles.val = 1;

            // Download the file using fetch and FileSaver.js to ensure it's downloaded
            // rather than displayed in the browser
            $http.get(url, {responseType: "arraybuffer"}).then(function (response) {
                progress.downloadedFiles.val = 1;
                progress.isProcessing.val = false;
                
                // Create a blob from the response data
                var blob = new Blob([response.data], {type: response.headers('content-type') || 'application/octet-stream'});
                
                // Trigger download using FileSaver.js
                saveAs(blob, repoInfo.downloadFileName);
                
                toastr.success("File downloaded successfully!", {iconClass: 'toast-down'});
            }, function(error) {
                progress.isProcessing.val = false;
                console.error("Error downloading file:", error);
                toastr.error("Failed to download file. The file may be too large or the URL may be invalid.", {iconClass: 'toast-down'});
                
                // Fallback: try opening the URL directly
                window.location = url;
            });
        }

        return {
            downloadZippedFiles: function(parameters, progress, toastr) {
                repoInfo = parseInfo(parameters);

                // Validate required fields
                if(!repoInfo.author || !repoInfo.repository){
                    toastr.error("Invalid GitHub URL. Please check the URL format.", {iconClass: 'toast-down'});
                    return;
                }

                if(!repoInfo.resPath || repoInfo.resPath==""){
                    // No specific path - download entire repository
                    if(!repoInfo.branch || repoInfo.branch==""){
                        repoInfo.branch="master";
                    }

                    var downloadUrl = "https://github.com/"+repoInfo.author+"/"+
                        repoInfo.repository+"/archive/"+repoInfo.branch+".zip";

                    toastr.info("Downloading entire repository...", {iconClass: 'toast-down'});
                    window.location = downloadUrl;

                }else{
                    // Check if it's a blob (file) URL - we can skip API check and directly download
                    if(repoInfo.pathType === "blob"){
                        var rawUrl = "https://raw.githubusercontent.com/"+repoInfo.author+"/"+
                            repoInfo.repository+"/"+repoInfo.branch+"/"+repoInfo.resPath;
                        toastr.info("Downloading file...", {iconClass: 'toast-down'});
                        downloadFile(rawUrl, progress, toastr);
                        return;
                    }
                    
                    // For tree (directory) URLs or unknown types, use API to check
                    $http.get(repoInfo.urlPrefix+repoInfo.resPath+repoInfo.urlPostfix).then(function(response) {
                        if(response.data instanceof Array){
                            // It's a directory
                            toastr.info("Preparing directory download...", {iconClass: 'toast-down'});
                            downloadDir(progress);
                        }else{
                            // It's a file
                            toastr.info("Downloading file...", {iconClass: 'toast-down'});
                            downloadFile(response.data.download_url, progress, toastr);
                        }

                    }, function(error) {
                        // API call failed - try constructing raw URL
                        console.log("API call failed, constructing raw URL. Error:", error);
                        var rawUrl = "https://raw.githubusercontent.com/"+repoInfo.author+"/"+
                            repoInfo.repository+"/"+repoInfo.branch+"/"+repoInfo.resPath;
                        
                        toastr.warning("Direct API access failed, attempting direct download...", {iconClass: 'toast-down'});
                        downloadFile(rawUrl, progress, toastr);
                    });
                }
            },
        };
    }
]);
