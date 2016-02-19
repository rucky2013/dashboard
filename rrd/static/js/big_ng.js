
angular.module('app', ['app.util'])
.config(function($interpolateProvider) {
    $interpolateProvider.startSymbol('[[');
    $interpolateProvider.endSymbol(']]');
})
.controller('BigCtrl', BigCtrl)

function BigCtrl(FlotServ, $scope, $interval, $timeout, $filter) {
    var vm = this;

    var urlH = '/chart/h';
    var defaultParam = FlotServ.getParam();
    var graph_type = defaultParam.graph_type;

    var unCheckedItems = [];

    if (graph_type === 'k') {
        urlH = '/chart/k';
    } else if (graph_type === 'a') {
        urlH = '/chart/a';
    }

    vm.chart = {}; // 前端的图, 对应后端的返回
    vm.config = []; // 绘图的数据, 会变化
    vm.data = []; // 缓存的绘图数据, 不会改变
    vm.param = angular.copy(defaultParam);


    vm.all = true; // 是否全选
    vm.reverse = false; // 是否反选

    vm.checkAll = checkAll;
    vm.checkReverse = checkReverse;
    vm.checkSearch = checkSearch;
    vm.reset = reset;
    vm.checkFilter = checkFilter;

    // watch
    $scope.$watch('vm.param', function(newVal, oldVal) {
        active(newVal);
    }, true);

    active(vm.param);

    // interval
    $interval(function() {
        vm.param.start = vm.param.start + 10;
        vm.param.end = vm.param.end +10;
    }, 10000);


    // reset
    function reset() {
        vm.param = angular.copy(defaultParam);
    }

    // active
    function active(param) {
        var paramMultiData = new Array();
        FlotServ.getMultiDataByIdForDomeos(param).then(function(ret) {
            for (var i=0; i < ret.length; i++) {
                paramMultiData.push(ret[i]['data']['series'][0]);
            }
            FlotServ.getData(urlH, param).success(function(ret) {
                vm.data = FlotServ.parseData(ret);
                vm.data = reRangeData(vm.data, ret['title'], paramMultiData);
                refreshConfig();
                vm.chart = ret;
                vm.chart.title = ret['title'].split('/')[0];
                vm.summary = FlotServ.summary(ret.series[0]);
            });
        });
    }

    function reRangeData(data, title, paramMultiData) {
        var domeos_data = obj.domeos_data;
        var domeos_type = obj.domeos_type;
        var new_data = [];
        if (domeos_type == 'node') {
            new_data = data;
        }
        else {
            if (domeos_type == 'pod') {
                for (var j=0; j < domeos_data.length; j++) {
                    var a_data = {
                        label: domeos_data[j]['podName'],
                        check: true,
                        data: []
                    };
                    // add up all container data in a pod
                    for (var k=0; k < domeos_data[j]['containers'].length; k++) {
                        var query_counter = title.split('/id=')[0] + '/id=' + domeos_data[j]['containers'][k]['containerId'];
                        var query_label = domeos_data[j]['containers'][k]['hostname'];
                        var query_data = searchData(query_label, query_counter, paramMultiData);
                        if (a_data['data'].length == 0) {
                            a_data['data'] = query_data;
                        }
                        else if (query_data.length == a_data['data'].length) {
                            for (var l=0; l < query_data.length; l++) {
                                a_data['data'][l][1] += query_data[l][1];
                            }
                        }
                        else {
                            // TODO containers in a pod have different length of data
                        }
                    }
                    new_data.push(a_data);
                }
            }
            else if (domeos_type == 'container') {
                for (var j=0; j < domeos_data.length; j++) {
                    var a_data = {
                        label: domeos_data[j]['containerId'].substr(0, 12),
                        check: true,
                        data: []
                    };
                    var query_counter = title.split('/id=')[0] + '/id=' + domeos_data[j]['containerId'];
                    var query_label = domeos_data[j]['hostname'];
                    var query_data = searchData(query_label, query_counter, paramMultiData);
                    a_data.data = query_data;
                    new_data.push(a_data);
                }
            }
        }
        return new_data;
    }

    function searchData(query_label, counter, paramMultiData) {
        for (var i=0; i < paramMultiData.length; i++) {
            if (paramMultiData[i]['name'] == query_label && paramMultiData[i]['counter'] == counter) {
                return paramMultiData[i]['data'];
            }
        }
    }


    function checkFilter() {
        _.each(vm.data, function(d) {
            d.check = false;
        });

        var query = vm.query;
        var checks = $filter('filter')(vm.data, {label:query});
        angular.forEach(checks, function(i) {
            i.check = true;
        });
    }


    // 全选
    function checkAll() {
        if (vm.all) {
            if (vm.reverse) {
                vm.reverse = false;
            }
            _.each(vm.data, function(d) {
                d.check = true;
            });
        } else {
            _.each(vm.data, function(d) {
                d.check = false;
            });
        }
    }


    // 反选
    function checkReverse () {
        if (vm.reverse) {
            vm.all = false;
            unCheckedItems = [];
            _.each(vm.data, function(d) {
                d.check = !d.check;
            });
        }
    }

    // 刷新
    function checkSearch() {
        var data2 = [];
        unCheckedItems = [];
        _.each(vm.data, function(d) {
            if (d.check) {
                data2.push(d);
            }
            else {
                unCheckedItems.push(d.label);
            }
        });
        vm.config = data2;
    }

    // keep unchecked items for refresh
    function refreshConfig() {
        vm.config = [];
        for (var i=0; i < vm.data.length; i++) {
            var has = false;
            for (var j=0; j < unCheckedItems.length; j++) {
                if (vm.data[i].label == unCheckedItems[j]) {
                    has = true;
                    vm.data[i].check = false;
                    break;
                }
            }
            if (has == false) {
                vm.data[i].check = true;
                vm.config.push(vm.data[i]);
            }
        }
    }

}