
angular.module('app', ['ui.bootstrap.datetimepicker', 'app.util'])
.config(function($interpolateProvider) {
    $interpolateProvider.startSymbol('[[');
    $interpolateProvider.endSymbol(']]');
})
.controller('MultiCtrl', MultiCtrl)

function MultiCtrl(FlotServ, $scope, $interval, $timeout) {
    var vm = this;

    // 全局的参数
    vm.defaultGlobalParam = {
        start: '',
        end: '',
        cf: 'AVERAGE', // MIN, MAX
        graph_type: 'h', // h Endpoint视角; k Counter视角
        sum: 'off' // off
    };
    vm.globalParam = angular.copy(vm.defaultGlobalParam);


    // var urlH = '/chart/h';
    // var urlK = '/chrt/k;
    var backendParam = FlotServ.getParam(); // 后端渲染出来的参数
    vm.globalParam.graph_type = backendParam.graph_type;

    vm.chart = {}; // 前端的图, 对应后端的返回
    vm.configs = []; // 绘图的数据, 多个
    vm.data = []; // 缓存的绘图数据, 不会改变
    // vm.param = angular.copy(defaultParam);


    vm.all = true; // 是否全选
    vm.reverse = false; // 是否反选

    vm.checkAll = checkAll;
    vm.checkReverse = checkReverse;
    vm.checkSearch = checkSearch;
    vm.reset = reset;
    vm.show = show;

    $scope.$watch('vm.globalParam.graph_type', function(newVal, oldVal) {
        if (newVal !== oldVal) {
            // change url
            var url = window.location.href;
            var newUrl;
            if (newVal === 'k') {
                newUrl = url.replace('graph_type=h', 'graph_type=k').replace('graph_type=a', 'graph_type=k');
            } else if (newVal === 'h') {
                newUrl = url.replace('graph_type=k', 'graph_type=h').replace('graph_type=a', 'graph_type=h');
            } else {
                newUrl = url.replace('graph_type=h', 'graph_type=a').replace('graph_type=k', 'graph_type=a');
            }
            window.location.href = newUrl;
        }
    });

    active(vm.globalParam);

    // reset 重置
    function reset() {
        vm.globalParam = angular.copy(vm.defaultGlobalParam);
    }

    // show 看图
    function show() {
        active(vm.globalParam);
    }

    // active
    function active(param) {
        // console.log(FlotServ.getUrls());
        var p = angular.copy(param);
        if (angular.isDate(p.start)) {
            p.start = +p.start/1000;
        }
        if (angular.isDate(p.end)) {
            p.end = +p.end/1000;
        }
        FlotServ.getMultiDataById(p).then(function(ret) {
            // [{data: {}}, {data: {}}, {data: {}}]
            // console.log(ret);
            // openxxs -- single graph data
            console.log(ret);
            var data;
            data = _.map(ret, function(i) {
                var o = {};
                o.config = FlotServ.parseData(i.data);
                o.title = i.data.title;
                return o;
            });
            vm.configs = reRangeData(data);
        });
    }

    /**
     * transfer endpoints-counters to nodes-counters or pods-counters or containers-counters
     * data example: [{"label":"bx-42-197","check":true,"data":[[1451547190000,0],[1451547200000,0],[1451547210000,0],[1451547220000,0]}]
     * @param data
     * @return new_data = ["title": "container.cpu.usage.total", "config": [{"label": "podName", "check": true, "data": [12345, 0]}]]
     */
    function reRangeData(data) {
        var domeos_data = obj.domeos_data;
        var domeos_type = obj.domeos_type;
        var new_data = [];
        if (domeos_type == 'node') {
            new_data = data;
        }
        else {
            // get counter types
            var counters = [];
            for (var i=0; i < data.length; i++) {
                var counter = data[i]['title'].split('/')[0];
                var has = false;
                for (var j=0; j < counters.length; j++) {
                    if (counters[j] == counter) {
                        has = true;
                        break;
                    }
                }
                if (!has) {
                    counters.push(counter);
                }
            }
            if (domeos_type == 'pod') {
                for (var i=0; i < counters.length; i++) {
                    var a_graph = {
                        title: counters[i],
                        config: []
                    };
                    for (var j=0; j < domeos_data.length; j++) {
                        var a_config = {
                            label: domeos_data[j]['podName'],
                            check: true,
                            data: []
                        };
                        for (var k=0; k < domeos_data[j]['containers'].length; k++) {
                            var query_title = counters[i] + "/id=" + domeos_data[j]['containers'][k]['containerId'];
                            var query_label = domeos_data[j]['containers'][k]['hostname'];
                            var query_data = searchData(query_title, query_label, data);
                            if (a_config['data'].length == 0) {
                                    a_config['data'] = query_data;
                            }
                            else if (query_data.length == a_config['data'].length) {
                                for (var l=0; l < query_data.length; l++) {
                                    a_config['data'][l][1] += query_data[l][1];
                                }
                            }
                            else {
                                // TODO containers in a pod have different length of data
                            }
                        }
                        a_graph['config'].push(a_config);
                    }
                    new_data.push(a_graph);
                }
            }
            else if (domeos_type == 'container') {
                for (var i=0; i < counters.length; i++) {
                    var a_graph = {
                        title: counters[i],
                        config: []
                    };
                    for (var j=0; j < domeos_data.length; j++) {
                        var query_title = counters[i] + "/id=" + domeos_data[j]['containerId'];
                        var query_label = domeos_data[j]['hostname'];
                        var query_data = searchData(query_title, query_label, data);
                        var a_config = {
                            // cut long containerId to short containerId
                            //label: domeos_data[j]['containerId'],
                            label: domeos_data[j]['containerId'].substr(0, 12),
                            check: true,
                            data: query_data
                        };
                        a_graph['config'].push(a_config);
                    }
                    new_data.push(a_graph);
                }
            }
        }
        return new_data;
    }

    function searchData(query_title, query_label, data) {
        for (var i=0; i < data.length; i++) {
            if (data[i]['title'] == query_title) {
                for (var j=0; j < data[i]['config'].length; j++) {
                    if (data[i]['config'][j]['label'] == query_label) {
                        return data[i]['config'][j]['data'];
                    }
                }
            }
        }
    }

    // 全选
    function checkAll() {
        if (vm.all) {
            _.each(vm.data, function(d) {
                d.check = true;
            });
        } else {
            _.each(vm.data, function(d) {
                d.check = false;
            });
        }
        // vm.config = vm.data;
    }


    // 反选
    function checkReverse () {
        if (vm.reverse) {
            vm.all = false;
            _.each(vm.data, function(d) {
                d.check = !d.check;
            });
        }
        // vm.config = vm.data;
    }

    // 确定
    function checkSearch() {
        var data2 = [];
        _.each(vm.data, function(d) {
            if (d.check) {
                data2.push(d);
            }
        });
        vm.config = data2;
        // vm.series = data2;
        // flot = $.plot(el, val, FlotServ.getConfig());
    }


}
