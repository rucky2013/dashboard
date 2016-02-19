#-*- coding:utf-8 -*-
import json
from flask import request, abort, g, make_response
from functools import wraps
from rrd import app

from rrd.model.tag_endpoint import TagEndpoint
from rrd.model.endpoint import Endpoint
from rrd.model.endpoint_counter import EndpointCounter
from rrd.model.graph import TmpGraph
from rrd.utils.rrdgraph import graph_query

@app.route("/api/query", methods=["GET"])
def api_query():
    ret = {
        "ok": False,
        "msg": "",
        "cpudata": [],
        "memdata": []
    }
    node = request.args.get("node") or ""
    containerid = request.args.get("containerid") or ""
    start_time = request.args.get("start") or ""
    end_time = request.args.get("end") or ""
    if not node:
        ret["msg"] = "node is not given"
        return json.dumps(ret)
    if not containerid:
        ret["msg"] = "container id is not given"
        return json.dumps(ret)
    if not start_time:
        ret["msg"] = "start time is not given"
        return json.dumps(ret)
    if not end_time:
        ret["msg"] = "end time is not given"
        return json.dumps(ret)
    endpoint_counters = []
    cpu_endpoint_counters = {
        "endpoint": node,
        "counter": "container.cpu.usage.total/id=" + containerid
    }
    mem_endpoint_counters = {
        "endpoint": node,
        "counter": "container.memory.usage/id=" + containerid
    }
    endpoint_counters.append(cpu_endpoint_counters)
    endpoint_counters.append(mem_endpoint_counters)
    start = int(start_time)
    end = int(end_time)
    query_result = graph_query(endpoint_counters, "AVERAGE", start, end)
    if not query_result:
        ret["msg"] = "query cpu and memory used data for node = " + node + " and containerId = " + containerid + " from falcon query is empty"
        return json.dumps(ret)
    cpu_ok = False
    mem_ok = False
    for query_data in query_result:
        if query_data["counter"] == cpu_endpoint_counters["counter"]:
            for value in query_data["Values"]:
                if not (value["value"] is None):
                    ret["cpudata"].append(value["value"])
            cpu_ok = True
        elif query_data["counter"] == mem_endpoint_counters["counter"]:
            for value in query_data["Values"]:
                if not (value["value"] is None):
                    ret["memdata"].append(value["value"])
            mem_ok = True
    if not cpu_ok:
        ret["msg"] = "query cpu used data for node " + node + " and container " + containerid + " from falcon query is empty"
        return json.dumps(ret)
    if not mem_ok:
        ret["msg"] = "query memory used data for node " + node + " and container " + containerid + " from falcon query is empty"
        return json.dumps(ret)
    ret["ok"] = True
    return json.dumps(ret)

@app.route("/api/endpoints")
def api_endpoints():
    ret = {
        "ok": False,
        "msg": "",
        "data": [],
    }

    q = request.args.get("q") or ""
    raw_tag = request.args.get("tags") or ""
    tags = raw_tag and [x.strip() for x in raw_tag.split(",")] or []
    limit = int(request.args.get("limit") or 100)

    if not q and not tags:
        ret["msg"] = "no query params given"
        return json.dumps(ret)
    
    endpoints = []

    if tags and q:
        endpoint_ids = TagEndpoint.get_endpoint_ids(tags, limit=limit) or []
        endpoints = Endpoint.search_in_ids(q.split(), endpoint_ids)
    elif tags:
        endpoint_ids = TagEndpoint.get_endpoint_ids(tags, limit=limit) or []
        endpoints = Endpoint.gets(endpoint_ids)
    else:
        endpoints = Endpoint.search(q.split(), limit=limit)

    endpoints_str = [x.endpoint for x in endpoints]
    endpoints_str.sort()
    ret['data'] = endpoints_str
    ret['ok'] = True

    return json.dumps(ret)


@app.route("/api/counters", methods=["POST"])
def api_get_counters():
    ret = {
        "ok": False,
        "msg": "",
        "data": [],
    }
    data = request.json or ""
    type = data['type']
    endpoints = []
    filter = ""
    containers = []
    if not type:
        ret['msg'] = "no type given"
        return json.dumps(ret)
    if type == "node":
        endpoints = data['data']
        filter = data['filter']
    elif type == "pod":
        filter = data['filter']
        for pod in data['data']:
            for container in pod['containers']:
                node = container['hostname']
                containers.append(container['containerId'])
                if len(endpoints) == 0:
                    endpoints.append(node)
                else:
                    p = 0
                    for endpoint in endpoints:
                        if endpoint == node:
                            break
                        else:
                            p = p + 1
                    if p != len(endpoints):
                        endpoints.append(node)
    elif type == "container":
        filter = data['filter']
        for container in data['data']:
            node = container['hostname']
            containers.append(container['containerId'])
            if len(endpoints) == 0:
                endpoints.append(node)
            else:
                p = 0
                for endpoint in endpoints:
                    if endpoint == node:
                        break
                    else:
                        p = p + 1
                if p != len(endpoints):
                    endpoints.append(node)

    endpoint_objs = Endpoint.gets_by_endpoint(endpoints)
    endpoint_ids = [x.id for x in endpoint_objs]
    if not endpoint_ids:
        ret['msg'] = "no endpoints in graph"
        return json.dumps(ret)
    if filter:
        filters = filter.split()
        ecs = EndpointCounter.search_in_endpoint_ids(filters, endpoint_ids)
    else:
        ecs = EndpointCounter.gets_by_endpoint_ids(endpoint_ids)
    if not ecs:
        ret["msg"] = "no counters in graph"
        return json.dumps(ret)
    counters_map = {}
    for x in ecs:
        if type == 'node':
            if 'id=' not in x.counter:
                counters_map[x.counter] = [x.counter, x.type_, x.step]
        elif type == 'pod' or type == 'container':
            if 'id=' in x.counter:
                if x.counter.split('/')[1].split('=')[1] in containers:
                    counters_map[x.counter] = [x.counter, x.type_, x.step]
    sorted_counters = sorted(counters_map.keys())
    sorted_values = [counters_map[x] for x in sorted_counters]
    ret['data'] = sorted_values
    ret['ok'] = True
    return json.dumps(ret)

@app.route("/api/tmpgraph", methods=["POST",])
def api_create_tmpgraph():
    d = request.data
    jdata = json.loads(d)
    endpoints = jdata.get("endpoints") or []
    counters = jdata.get("counters") or []
    id_ = TmpGraph.add(endpoints, counters)

    ret = {
        "ok": False,
        "id": id_,
    }
    if id_:
        ret['ok'] = True
        return json.dumps(ret)
    else:
        return json.dumps(ret)
