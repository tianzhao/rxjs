//works on js collections
const _map = new Map();
_map.set(1, 'Hi');
_map.set(2, 'Bye');

const mapSource = from(_map);
//output: [1, 'Hi'], [2, 'Bye']
const subscribe = mapSource.subscribe(val => console.log(val));
