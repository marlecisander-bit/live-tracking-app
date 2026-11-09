import {along} from '@turf/along';
import {bearing} from '@turf/bearing';
import {distance} from '@turf/distance';
import {length} from '@turf/length';
import {lineSliceAlong} from '@turf/line-slice-along';
import {lineString,point} from '@turf/helpers';
import {nearestPointOnLine} from '@turf/nearest-point-on-line';
window.turf = Object.freeze({along,bearing,distance,length,lineSliceAlong,lineString,point,nearestPointOnLine});
