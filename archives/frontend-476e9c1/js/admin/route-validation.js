/* Publication invariants for this five-stop RC1 route; validation never edits input. */
(function(root) {
    'use strict';
    const RAD = Math.PI / 180, EARTH = 6371000, STOP_RADIUS_METRES = 200;
    function distance(a,b) {
        const dLat=(b[1]-a[1])*RAD,dLng=(b[0]-a[0])*RAD;
        const h=Math.sin(dLat/2)**2+Math.cos(a[1]*RAD)*Math.cos(b[1]*RAD)*Math.sin(dLng/2)**2;
        return 2*EARTH*Math.asin(Math.sqrt(Math.min(1,h)));
    }
    function validate(data) {
        function check(ok,message) { if (!ok) throw new Error(message); }
        check(data?.type==='FeatureCollection' && Array.isArray(data.features), 'Use a GeoJSON FeatureCollection.');
        check(data.features.length<=1000, 'A map may contain at most 1,000 objects.');
        check(JSON.stringify(data).length<=5*1024*1024, 'Map data must be at most 5 MB.');
        const ids=new Set(),stops=[],routes=[];
        let vertices=0;
        function coordinate(c) {
            check(Array.isArray(c)&&c.length>=2&&c.length<=3&&c.every(v=>typeof v==='number'&&Number.isFinite(v)), 'Coordinates must contain finite longitude and latitude.');
            check(Math.abs(c[0])<=180&&Math.abs(c[1])<=90, 'Coordinates are outside longitude/latitude limits.');
            check(++vertices<=100000,'Map geometry is too large.');
        }
        for (const f of data.features) {
            const p=f?.properties,g=f?.geometry;
            check(f?.type==='Feature'&&p&&typeof p==='object'&&!Array.isArray(p),'Every map object needs Feature properties.');
            check(typeof p.objectId==='string'&&p.objectId.trim().length>0&&p.objectId.length<=150&&!ids.has(p.objectId),'Every object needs a unique, non-empty ID.');
            ids.add(p.objectId);
            check(typeof p.name==='string'&&p.name.trim().length>0&&p.name.length<=100,'Every object needs a name of 1–100 characters.');
            check(g&&['Point','LineString'].includes(g.type),'Only Point and LineString geometry is supported.');
            if(g.type==='Point') { coordinate(g.coordinates);check(['stop','poi'].includes(p.pointType),'Points must be stops or POIs.');if(p.pointType==='stop'&&p.active!==false)stops.push(f); }
            else {check(Array.isArray(g.coordinates)&&g.coordinates.length>=2,'A route needs at least two coordinates.');g.coordinates.forEach(coordinate);if(p.active!==false)routes.push(f);}
        }
        check(stops.length===5,'Keep exactly five active stops, numbered 1–5.');
        const numbers=stops.map(f=>Number(f.properties.stopNumber));
        check(numbers.every(n=>Number.isInteger(n)&&n>=1&&n<=5)&&new Set(numbers).size===5,'Active stop numbers must be unique and cover 1–5.');
        const ordered=[...stops].sort((a,b)=>Number(a.properties.stopNumber)-Number(b.properties.stopNumber));
        check(new Set(ordered.map(f=>f.geometry.coordinates.slice(0,2).join(','))).size===5,'Active stops must have distinct coordinates.');
        check(routes.length===1,'Keep exactly one active route for the five-stop tour.');
        const route=routes[0];check(route.properties.objectType==='route','The active route must have objectType route.');const seq=route.properties.stopSequence,expected=ordered.map(f=>f.properties.objectId);
        check(Array.isArray(seq)&&seq.length===6&&seq.every((id,i)=>id===expected[i%5]),'Route order must reference stops 1, 2, 3, 4, 5, then stop 1 once to close the loop.');
        const line=route.geometry.coordinates,origin=ordered[0].geometry.coordinates;
        check(distance(line[0],origin)<=STOP_RADIUS_METRES&&distance(line.at(-1),origin)<=STOP_RADIUS_METRES,'The route must start and finish within 200 m of stop 1.');
        check(distance(line[0],line.at(-1))<=20,'Close the route loop: its endpoints must be within 20 m.');
        let total=0;const segments=[];
        for(let i=1;i<line.length;i++){const length=distance(line[i-1],line[i]);if(length>0)segments.push({a:line[i-1],b:line[i],start:total,length});total+=length;}
        check(total>0,'Route geometry must have non-zero length.');
        let previous=-1;
        for(const stop of ordered) {
            const c=stop.geometry.coordinates,cos=Math.cos(c[1]*RAD);let best=null;
            for(const s of segments) {
                const ax=(s.a[0]-c[0])*RAD*EARTH*cos,ay=(s.a[1]-c[1])*RAD*EARTH,bx=(s.b[0]-c[0])*RAD*EARTH*cos,by=(s.b[1]-c[1])*RAD*EARTH,dx=bx-ax,dy=by-ay;
                const t=Math.max(0,Math.min(1,-(ax*dx+ay*dy)/(dx*dx+dy*dy||1))),offset=s.start+t*s.length,metres=Math.hypot(ax+t*dx,ay+t*dy);
                if(offset>previous+0.01&&metres<=STOP_RADIUS_METRES&&(!best||metres<best.metres))best={offset,metres};
            }
            check(best, 'Stop '+stop.properties.stopNumber+' must lie within 200 m of the route in tour order.');previous=best.offset;
        }
        return data;
    }
    const api={validate,distance,STOP_RADIUS_METRES};
    if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.routeValidation=api;
})(typeof window!=='undefined'?window:globalThis);
