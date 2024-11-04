/*
 * This file is part of Invenio.
 * Copyright (C) 2016 CERN.
 *
 * Invenio is free software; you can redistribute it and/or
 * modify it under the terms of the GNU General Public License as
 * published by the Free Software Foundation; either version 2 of the
 * License, or (at your option) any later version.
 *
 * Invenio is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with Invenio; if not, write to the Free Software Foundation, Inc.,
 * 59 Temple Place, Suite 330, Boston, MA 02111-1307, USA.
 *
 * In applying this license, CERN does not
 * waive the privileges and immunities granted to it by virtue of its status
 * as an Intergovernmental Organization or submit itself to any jurisdiction.
 */

angular.module('invenioFiles.controllers', []);
angular.module('invenioFiles.directives', []);
angular.module('invenioFiles.factories', []);
angular.module('invenioFiles.filters', []);
angular.module('invenioFiles.services', []);

angular.module('invenioFiles', [
  'ngFileUpload',
  'invenioFiles.services',
  'invenioFiles.factories',
  'invenioFiles.filters',
  'invenioFiles.controllers',
  'invenioFiles.directives',
]);


function InvenioFilesCtrl($rootScope, $scope, $q, $timeout,
  InvenioFilesAPI, InvenioFilesUploaderModel) {

  var vm = this;


  vm.invenioFilesEndpoints = {};

  vm.invenioFilesArgs = {
    data: {
      file: [],
    },
    headers: {
      'Content-Type': 'application/json'
    }
  };

  var Uploader = new InvenioFilesUploaderModel();

  function getEndpoints(){
    var deferred = $q.defer();
    if (vm.invenioFilesEndpoints.bucket === undefined) {
      InvenioFilesAPI.request({
        method: 'POST',
        url: vm.invenioFilesEndpoints.initialization,
        data: {},
        headers: (vm.invenioFilesArgs.headers !== undefined) ?
          vm.invenioFilesArgs.headers : {}
      }).then(function success(response) {
        vm.invenioFilesArgs.url = response.data.links.bucket;
        $rootScope.$broadcast(
          'invenio.records.endpoints.updated', response.data.links
        );
        deferred.resolve({});
      }, function error(response) {
        deferred.reject(response);
      });
    } else {
      vm.invenioFilesArgs.url = vm.invenioFilesEndpoints.bucket;
      deferred.resolve({});
    }
    return deferred.promise;
  }

  function upload() {
    getEndpoints().then(function() {
      Uploader.setArgs(vm.invenioFilesArgs);
      var states = Uploader.getStates();
      Uploader.setState(states.STARTED);
      Uploader.next();
      $rootScope.$emit('invenio.uploader.upload.started');
    }, function(response) {
      $scope.$broadcast('invenio.uploader.error', response);
    });
  }

  function invenioUploaderInit(evt, params, endpoints, files, links) {
    vm.invenioFilesArgs = angular.merge(
      {},
      vm.invenioFilesArgs,
      params
    );

    vm.invenioFilesEndpoints = angular.merge(
      {},
      vm.invenioFilesEndpoints,
      endpoints
    );

    if (Object.keys(links).length > 0) {
      $rootScope.$broadcast(
        'invenio.records.endpoints.updated', links
      );
    }
    vm.files = files;
  }

  function invenioFilesEndpointsUpdated(evt, endpoints) {
    vm.invenioFilesEndpoints = angular.merge(
      {},
      vm.invenioFilesEndpoints,
      endpoints
    );
  }

  function getCompleted() {
    return _.reject(vm.files, function(file) {
      return file.completed === undefined;
    });
  }

  function removeFile(file) {
    if (file.completed !== undefined) {
      var args = angular.copy(vm.invenioFilesArgs);
      args.method = 'DELETE';

      if (file.multipart === true) {
        args.url = (file.completed && file.links.object_version) ?
          file.links.object_version : file.links.self;
      } else {
        args.url = (file.links.version) ?
          file.links.version : file.links.self;
      }

      InvenioFilesAPI.request(args).then(function(response) {
        vm.files.splice(_.indexOf(vm.files, file), 1);
        Uploader.removeFromQueueIndex(file);
        $scope.$broadcast('invenio.uploader.file.deleted', file);
      }, function(response) {
        $scope.$broadcast('invenio.uploader.error', response);
      });
    } else {
      vm.files.splice(_.indexOf(vm.files, file), 1);
      Uploader.removeFromQueueIndex(file);
      $scope.$broadcast('invenio.uploader.file.deleted', file);
    }
  }

  function fileReducer(file) {
    return {
      key: file.name,
      uri: false,
      multipart: (vm.invenioFilesArgs.resumeChunkSize === undefined ||
        file.size < vm.invenioFilesArgs.resumeChunkSize) ? false : true,
    };
  }

  function addFiles(files) {
    angular.forEach(files, function(file, index) {
      if (_.findWhere(vm.files, {key: file.key}) === undefined) {
        angular.forEach(fileReducer(file), function(value, key) {
          file[key] = value;
        });
        vm.files.push(file);
        Uploader.pushToQueue(file);
      }
    });
  }

  function invenioFilesUploadCancel() {
    Uploader.cancelUploads();
  }

  function findInFiles(key) {
    var index = -1;
    angular.forEach(vm.files, function(value, _index) {
      if (value.key === key) {
        index = _index;
        return;
      }
    });
    return index;
  }

  function fileUploadedSuccess(evnt, data) {
    var _obj = data.data;

    var index = findInFiles(_obj.key);
    if (index > -1) {
      vm.files[index].completed = true;
      delete vm.files[index].processing;
      vm.files[index] = angular.merge(
        {},
        vm.files[index],
        _obj
      );
    }
  }

  function fileUploadedError(evnt, data) {
    var index = findInFiles(
      data.config.data.file !== undefined ?
        data.config.data.file.key : data.config.data.key
    );
    if (index > -1) {
      vm.files[index].errored = true;
      delete vm.files[index].processing;
      $scope.$broadcast('invenio.uploader.error', data);
    }
  }

  function fileUploadedProgress(evnt, data) {
    var index = findInFiles(
      data.file !== undefined ? data.file.key : data.key
    );
    if (index > -1) {
      vm.files[index].progress = data.progress;
    }
  }

  function fileUploadedProcessing(evnt, data) {
    var index = findInFiles(data.file.key);
    if (index > -1) {
      delete vm.files[index].progress;
      vm.files[index].processing = true;
    }
  }

  function invenioFilesError(evt, data) {
    vm.invenioFilesError = {};
    vm.invenioFilesError = data;
  }

  function invenioUploaderStarted(evt) {
    vm.invenioFilesError = {};
    vm.invenioFilesBusy = true;
  }

  function invenioUploaderCompleted() {
    $timeout(function() {
      vm.invenioFilesBusy = false;
    }, 10);
  }

  function reinitializeUploader() {
    angular.forEach(vm.files, function(file, index) {
      if (file.progress !== undefined && file.progress < 100) {
        if (file.multipart) {
          var args = angular.copy(vm.invenioFilesArgs);
          args.method = 'DELETE';
          args.url = file.links.self;
          InvenioFilesAPI.request(args).then(function(response) {
            $scope.$broadcast('invenio.uploader.file.deleted', file);
          }, function(response) {
            $scope.$broadcast('invenio.uploader.error', response);
          });
        }
        delete vm.files[index].progress;
        delete vm.files[index].processing;
        delete vm.files[index].errored;
      }
      if (file.completed === undefined) {
        Uploader.pushToQueue(vm.files[index]);
      }
    });
  }

  function invenioUploaderCanceled() {
    invenioUploaderCompleted();
    reinitializeUploader();
  }


  vm.addFiles = addFiles;
  vm.cancel = invenioFilesUploadCancel;
  vm.files = [];
  vm.getCompleted = getCompleted;
  vm.invenioFilesBusy = false;
  vm.invenioFilesError = {};
  vm.remove = removeFile;
  vm.upload = upload;



  $scope.$on('invenio.uploader.init', invenioUploaderInit);

  $scope.$on('invenio.uploader.error', invenioFilesError);

  $rootScope.$on(
    'invenio.uploader.upload.file.uploaded', fileUploadedSuccess
  );
  $rootScope.$on(
    'invenio.uploader.upload.file.errored', fileUploadedError);
  $rootScope.$on(
    'invenio.uploader.upload.file.progress', fileUploadedProgress
  );
  $rootScope.$on(
    'invenio.uploader.upload.file.processing', fileUploadedProcessing
  );

  $rootScope.$on(
    'invenio.uploader.upload.started', invenioUploaderStarted
  );
  $rootScope.$on(
    'invenio.uploader.upload.completed', invenioUploaderCompleted
  );
  $rootScope.$on(
    'invenio.uploader.upload.canceled', invenioUploaderCanceled
  );

  $rootScope.$on(
    'invenio.records.endpoints.updated', invenioFilesEndpointsUpdated
  );

}

InvenioFilesCtrl.$inject = [
  '$rootScope', '$scope', '$q', '$timeout', 'InvenioFilesAPI',
  'InvenioFilesUploaderModel'
];

angular.module('invenioFiles.controllers')
  .controller('InvenioFilesCtrl', InvenioFilesCtrl);


function invenioFilesError() {

  function link(scope, element, attrs, vm) {
    scope.errorMessage = attrs.errorMessage || 'Error';
  }

  function templateUrl(element, attrs) {
    return attrs.template;
  }


  return {
    restricted: 'AE',
    require: '^invenioFilesUploader',
    scope: false,
    templateUrl: templateUrl,
    link: link,
  };
}

angular.module('invenioFiles.directives')
  .directive('invenioFilesError', invenioFilesError);


function invenioFilesList() {

  function templateUrl(element, attrs) {
    return attrs.template;
  }


  return {
    restricted: 'AE',
    require: '^invenioFilesUploader',
    scope: false,
    templateUrl: templateUrl,
  };
}

angular.module('invenioFiles.directives')
  .directive('invenioFilesList', invenioFilesList);


function invenioFilesUploadZone() {

  function templateUrl(element, attrs) {
    return attrs.template;
  }


  return {
    restricted: 'AE',
    require: '^invenioFilesUploader',
    scope: false,
    templateUrl: templateUrl,
  };
}

angular.module('invenioFiles.directives')
  .directive('invenioFilesUploadZone', invenioFilesUploadZone);


function invenioFilesUploader() {


  function link(scope, element, attrs, vm) {
    var endpoints = {
      initialization: attrs.initialization || undefined,
    };
    var params = JSON.parse(attrs.extraParams || '{}');
    var files = JSON.parse(attrs.files || '[]');
    var links = JSON.parse(attrs.links || '[]');

    scope.$broadcast('invenio.uploader.init',
      params,
      endpoints,
      files,
      links
    );
  }


  return {
    restricted: 'AE',
    scope: false,
    controller: 'InvenioFilesCtrl',
    controllerAs: 'filesVM',
    link: link,
  };
}

angular.module('invenioFiles.directives')
  .directive('invenioFilesUploader', invenioFilesUploader);


function InvenioFilesUploaderModel($rootScope, $q, InvenioFilesAPI) {

  function Uploader(args) {
    this.args = angular.copy(args || {});
    this.queue = [];
    this.uploads = [];
    this.pending = [];
    this.state = {
      STARTED: 1,
      STOPPED: 2,
    };
    this.currentState = this.state.STOPPED;
  }

  Uploader.prototype.setArgs= function(args) {
    this.args = angular.copy(args || {});
  };

  Uploader.prototype.pushToQueue = function(file) {
    this.queue.push(file);
  };

  Uploader.prototype.removeFromQueue = function() {
    return this.queue.shift();
  };

  Uploader.prototype.removeFromQueueIndex = function(file) {
    this.queue.splice(_.indexOf(this.queue, file), 1);
    $rootScope.$emit('invenio.uploader.upload.file.removed');
  };

  Uploader.prototype.addUpload = function(upload) {
    this.uploads.push(upload);
  };

  Uploader.prototype.removeUpload = function(upload) {
    this.uploads.splice(_.indexOf(this.uploads, upload), 1);
  };

  Uploader.prototype.getUploads = function() {
    return this.uploads;
  };

  Uploader.prototype.cancelUploads = function() {
    this.setState(this.state.STOPPED);
    var uploads = angular.copy(this.uploads);
    this.flush();
    _.each(uploads, function(upload, index) {
      if (upload) {
        upload.abort();
      }
      if (uploads.length === index + 1) {
        _.delay(function() {
          $rootScope.$emit('invenio.uploader.upload.canceled');
        });
      }
    });
  };

  Uploader.prototype.setState = function(state) {
    this.currentState = state;
    $rootScope.$emit('invenio.uploader.state.changed', state);
  };

  Uploader.prototype.getState = function() {
    return this.currentState;
  };

  Uploader.prototype.getStates = function() {
    return this.state;
  };

  Uploader.prototype.pushToPending = function(file) {
    this.pending.push(file);
  };

  Uploader.prototype.removeFromPending = function() {
    return this.pending.shift();
  };

  Uploader.prototype.next = function() {
    if (this.getState() === this.state.STARTED) {
      var uploadNext;
      if(this.pending.length) {
        uploadNext = this.removeFromPending();
      }
      if (!uploadNext) {
        uploadNext = this.removeFromQueue();
      }

      if (uploadNext) {
        this.upload(uploadNext);
        $rootScope.$emit('invenio.uploader.next.requested', uploadNext);
      } else if (!this.uploads.length) {
        this.flush();
        $rootScope.$emit('invenio.uploader.upload.completed');
        this.setState(this.state.STOPPED);
      }
    }
  };

  Uploader.prototype.checkUploadStatus = function(upload) {
    var defer = $q.defer();
    if (upload.xhr !== undefined) {
      defer.resolve(upload);
    } else {
      upload.then(function(ret) {
        defer.resolve(ret);
      });
    }
    return defer.promise;
  };

  Uploader.prototype.upload = function(file) {
    var that = this;
    if (that.getUploads().length < (that.args.max_request_slots || 3)) {
      that._upload(file)
        .then(function(_obj) {
          var upload = InvenioFilesAPI
            .upload(_obj.uploadArgs, _obj.multipartUpload);
          $rootScope.$emit('invenio.uploader.upload.file.init', file);
          that.addUpload(upload);
          upload.then(
              function(response) {
                var params = (response.data.links === undefined) ? _obj.uploadArgs.url : response;
                _obj.successCallback
                  .call(this, params, file)
                  .then(
                    function(response) {
                      $rootScope.$emit(
                        'invenio.uploader.upload.file.uploaded',
                        response
                      );
                    }, function(response) {
                      $rootScope.$emit(
                        'invenio.uploader.upload.file.errored', response
                        );
                    });
              }, function(response) {
                $rootScope.$emit(
                  'invenio.uploader.upload.file.errored', response
                );
              }, function(evt) {
                var progress = parseInt(100.0 * evt.loaded / evt.total, 10);
                var params = {
                  file: evt.config.data.file || evt.config.data,
                  progress: progress > 100 ? 100 : progress
                };
                $rootScope.$emit(
                  'invenio.uploader.upload.file.progress', params
                );
              }
            )
            .finally(function(evt) {
                that.removeUpload(this);
                _.delay(function() {
                  that.next();
                });
                $rootScope.$emit('invenio.uploader.upload.next.call');
              });
        });
    } else {
      that.pushToPending(file);
      $rootScope.$emit('invenio.uploader.upload.file.pending', file);
    }
  };

  Uploader.prototype._upload = function (file) {
    var deferred = $q.defer();
    var that = this;
    if (this.args.resumeChunkSize === undefined || file.size < this.args.resumeChunkSize) {
      $rootScope.$emit(
        'invenio.uploader.upload.file.normal.requested', file
      );
      var args = that._prepareRequest(file, 'PUT');
      args.data = file;
      deferred.resolve({
        uploadArgs: args,
        multipartUpload: false,
        successCallback: that.postNormalUploadProcess
      });
    } else {
      $rootScope.$emit(
        'invenio.uploader.upload.file.chunked.requested', file
      );
      var _args = that._prepareRequest(file, 'POST');
      _args.data.file = file;
      that._requestUploadID(_args)
        .then(function(response) {
          var _requestArgs = that._prepareRequest(file, 'PUT');
          _requestArgs.data.file = file;
          _requestArgs.url = response.data.links.self;
          deferred.resolve({
            uploadArgs: _requestArgs,
            multipartUpload: true,
            successCallback: that.postChunkUploadProcess
          });
        });
    }
    return deferred.promise;
  };

  Uploader.prototype.postChunkUploadProcess = function(url, file) {
    var deferred = $q.defer();
    $rootScope.$emit('invenio.uploader.upload.file.processing', {file: file});
    InvenioFilesAPI.request({
      method: 'POST',
      url: url,
    }).then(function(response) {
      deferred.resolve(response);
    }, function(error) {
      deferred.reject(error);
    });
    return deferred.promise;
  };

  Uploader.prototype.postNormalUploadProcess = function(obj, file) {
    var deferred = $q.defer();
    deferred.resolve(obj);
    return deferred.promise;
  };

  Uploader.prototype._requestUploadID = function(args) {
    args.params = {
      uploads: 1,
      size: args.data.file.size,
      partSize: args.resumeChunkSize
    };
    return InvenioFilesAPI.request(args);
  };

  Uploader.prototype._prepareRequest = function(file, method) {
    var args = angular.copy(this.args);
    args.url = args.url + '/' + file.key;
    args.method = method || 'POST';
    args.headers['Content-Type'] = (file.type || '').indexOf('/') > -1 ?
      file.type : '';
    return args;
  };

  Uploader.prototype.flush = function() {
    this.pending = [];
    this.uploads = [];
    this.queue = [];
  };


  return Uploader;
}

InvenioFilesUploaderModel.$inject = [
  '$rootScope',
  '$q',
  'InvenioFilesAPI'
];

angular.module('invenioFiles.factories')
  .factory('InvenioFilesUploaderModel', InvenioFilesUploaderModel);


function bytesToHumanReadable() {

  function filter(size) {
    function round(num, precision) {
      return Math.round(
        num * Math.pow(10, precision)) / Math.pow(10, precision
      );
    }
    var limit = Math.pow(1024, 4);
    if (size > limit) {
      return round(size / limit, 1) + ' Tb';
    } else if (size > (limit/=1024)) {
      return round(size / limit, 1) + ' Gb';
    } else if (size > (limit/=1024)) {
      return round(size / limit, 1) + ' Mb';
    } else if (size > 1024) {
      return Math.round(size / 1024) +  ' Kb';
    }
    return size + ' B';
  }


  return filter;
}

angular.module('invenioFiles.filters')
  .filter('bytesToHumanReadable', bytesToHumanReadable);


function InvenioFilesAPI($http, Upload) {

  function upload(args, multipartUpload) {
    if (multipartUpload) {
      return Upload.upload(args);
    }
      return Upload.http(args);
  }

  function request(args) {
    return $http(args);
  }


  return {
    request: request,
    upload: upload
  };
}

InvenioFilesAPI.$inject = [
  '$http',
  'Upload'
];

angular.module('invenioFiles.services')
  .service('InvenioFilesAPI', InvenioFilesAPI);
