//emit 'Observable.empty()!' when empty, else any values from source
const example = empty().pipe(defaultIfEmpty('Observable.empty()!'));
//output: 'Observable.empty()!'
const subscribe = example.subscribe(val => console.log(val));

