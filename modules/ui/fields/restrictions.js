import { dispatch as d3_dispatch } from 'd3-dispatch';

import {
    select as d3_select,
    event as d3_event
} from 'd3-selection';

import { t } from '../../util/locale';

import {
    behaviorBreathe,
    behaviorHover
} from '../../behavior';

import {
    osmEntity,
    osmIntersection,
    osmInferRestriction,
    osmTurn
} from '../../osm';

import {
    actionRestrictTurn,
    actionUnrestrictTurn
} from '../../actions';

import {
    geoExtent,
    geoRawMercator,
    geoZoomToScale
} from '../../geo';

import {
    svgLayers,
    svgLines,
    svgTurns,
    svgVertices
} from '../../svg';

import { utilRebind } from '../../util/rebind';
import { utilFunctor } from '../../util';

import {
    utilGetDimensions,
    utilSetDimensions
} from '../../util/dimensions';


export function uiFieldRestrictions(field, context) {
    var dispatch = d3_dispatch('change');
    var breathe = behaviorBreathe(context);
    var hover = behaviorHover(context);
    var initialized = false;
    var vertexID;
    var fromNodeID;


    function restrictions(selection) {
        // if form field is hidden or has detached from dom, clean up.
        if (!d3_select('.inspector-wrap.inspector-hidden').empty() || !selection.node().parentNode) {
            selection.call(restrictions.off);
            return;
        }

        var wrap = selection.selectAll('.preset-input-wrap')
            .data([0]);

        var enter = wrap.enter()
            .append('div')
            .attr('class', 'preset-input-wrap');

        enter
            .append('div')
            .attr('class', 'restriction-help');


        var intersection = osmIntersection(context.graph(), vertexID);
        var graph = intersection.graph;
        var vertex = graph.entity(vertexID);
        var filter = utilFunctor(true);
        var projection = geoRawMercator();

        var d = utilGetDimensions(wrap.merge(enter));
        var c = [d[0] / 2, d[1] / 2];
        var z = 24;

        projection
            .scale(geoZoomToScale(z));

        var s = projection(vertex.loc);

        projection
            .translate([c[0] - s[0], c[1] - s[1]])
            .clipExtent([[0, 0], d]);

        var extent = geoExtent(projection.invert([0, d[1]]), projection.invert([d[0], 0]));

        var drawLayers = svgLayers(projection, context).only('osm').dimensions(d);
        var drawVertices = svgVertices(projection, context);
        var drawLines = svgLines(projection, context);
        var drawTurns = svgTurns(projection, context);

        enter
            .call(drawLayers);

        wrap = wrap
            .merge(enter);

        var surface = wrap.selectAll('.surface');

        if (!enter.empty()) {
            initialized = true;
            surface
                .call(breathe)
                .call(hover);
        }

        surface
            .call(utilSetDimensions, d)
            .call(drawVertices, graph, [vertex], filter, extent, true)
            .call(drawLines, graph, intersection.ways, filter)
            .call(drawTurns, graph, intersection.turns(fromNodeID));

        surface
            .on('click.restrictions', click)
            .on('mouseover.restrictions', mouseover)
            .on('mouseout.restrictions', mouseout);

        surface
            .selectAll('.selected')
            .classed('selected', false);

        if (fromNodeID) {
            surface
                .selectAll('.' + intersection.highways[fromNodeID].id)
                .classed('selected', true);
        }

        mouseout();

        context.history()
            .on('change.restrictions', render);

        d3_select(window)
            .on('resize.restrictions', function() {
                utilSetDimensions(wrap, null);
                render();
            });


        function click() {
            surface
                .call(breathe.off)
                .call(breathe);

            var datum = d3_event.target.__data__;
            var entity = datum && datum.properties && datum.properties.entity;
            if (entity) datum = entity;

            if (datum instanceof osmEntity) {
                fromNodeID = intersection.adjacentNodeId(datum.id);
                render();

            } else if (datum instanceof osmTurn) {
                if (datum.restriction) {
                    context.perform(
                        actionUnrestrictTurn(datum, projection),
                        t('operations.restriction.annotation.delete')
                    );
                } else {
                    context.perform(
                        actionRestrictTurn(datum, projection),
                        t('operations.restriction.annotation.create')
                    );
                }
            }
        }


        function mouseover() {
            var datum = d3_event.target.__data__;
            if (datum instanceof osmTurn) {
                var graph = context.graph();
                var presets = context.presets();
                var preset;

                if (datum.restriction) {
                    preset = presets.match(graph.entity(datum.restriction), graph);
                } else {
                    preset = presets.item('type/restriction/' +
                        osmInferRestriction(
                            graph,
                            datum.from,
                            datum.via,
                            datum.to,
                            projection
                        )
                    );
                }

                wrap.selectAll('.restriction-help')
                    .text(t('operations.restriction.help.' +
                        (datum.restriction ? 'toggle_off' : 'toggle_on'),
                        { restriction: preset.name() })
                    );
            }
        }


        function mouseout() {
            wrap.selectAll('.restriction-help')
                .text(t('operations.restriction.help.' +
                    (fromNodeID ? 'toggle' : 'select'))
                );
        }


        function render() {
            if (context.hasEntity(vertexID)) {
                restrictions(selection);
            }
        }
    }


    restrictions.entity = function(_) {
        if (!vertexID || vertexID !== _.id) {
            fromNodeID = null;
            vertexID = _.id;
        }
    };


    restrictions.tags = function() {};
    restrictions.focus = function() {};


    restrictions.off = function(selection) {
        if (!initialized) return;

        selection.selectAll('.surface')
            .call(hover.off)
            .call(breathe.off)
            .on('click.restrictions', null)
            .on('mouseover.restrictions', null)
            .on('mouseout.restrictions', null);

        context.history()
            .on('change.restrictions', null);

        d3_select(window)
            .on('resize.restrictions', null);
    };


    return utilRebind(restrictions, dispatch, 'on');
}
