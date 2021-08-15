
/*
 *  1. utility 
 */

const unit = undefined;
 
/*
 *  2. Progress 
 */

class Progress {
	constructor(parent) {
		if (parent) {
			this.parent = parent; 
			parent.children.push(this);
		}
	}

	cancelled = false;
	paused = false;
	pending = [];
	children = [];
	cancellers = [];

	cons() { return new Progress(this); }

	unlink () { 
		if (this.parent) {
			this.parent.children = this.parent.children.filter(c => c != this); 
		}
	}

	addCanceller = c => this.cancellers.push(c)

	removeCanceller = c1 => { this.cancellers = this.cancellers.filter(c => c != c1) }

	isAlive () { return ! this.cancelled; }

	cancel () { 
		if (! this.cancelled) { 
			this.cancelled = true; 
			this.cancellers.forEach(c => setTimeout(c, 0)); 
			this.children.forEach(c => c.cancel());

			this.cancellers = [];
		} 
	}

	pause () { this.paused = true; }

	resume() { 
		this.paused = false;
		let l = this.pending
		this.pending = [] 
		if (this.isAlive()) l.forEach(k => k()); 
	}

	isPaused (k) { 
		if (this.paused) { 
			this.pending.push(k)
			return true;
		}
		else if (this.parent) {
			return this.parent.isPaused(k); 
		}
		else {
			return false;
		}
	}
}

/*
 *  3. AsyncM 
 */

class AsyncM {
	// run :: Progress -> Promise a 
	constructor (run) {
		this.run = run;
	}

	seq = a => this.bind(_ => a)

	loop = _ => new AsyncM (async p => { while(true) { await this.run(p) } })

	while = f => new AsyncM (async p => { while (f()) { await this.run(p) } })

	if = f => new AsyncM (async p => (f())? this.run(p) : unit)

	block = _ => new AsyncM(_ => this.run(new Progress()))

	start = (p = new Progress()) => { AsyncM.timeout(0).bind(_=>this)._run(p); return p; } 

	_run = p => this.run(p).catch(e => { 
		if (e != "interrupted") throw e; 
		// else console.log(e); 
	}); 

	// catch exception in 'this' with handler 'h'
	// AsyncM a -> (e -> a) -> AsyncM a
	catch = h => new AsyncM(p => this.run(p).catch(h))

	// f <$> this
	fmap = f => new AsyncM (p => this.run(p).then(f)); 

	// this >>= f
	bind = f => new AsyncM (p => this.run(p).then(x => { let r = f(x); return (r && r.run) ? r.run(p) : r })); 

	// flatten an AsyncM of AsyncM
	join = _ => this.bind(m => m)

	// this <*> mx
	app = mx => this.bind(f => mx.bind(x => AsyncM.pure(f(x))))

	// return an AsyncM of AsyncM to wait for the result of 'this'
	// AsyncM a -> _ -> AsyncM (AsyncM a)
	spawn = _ => new AsyncM (async p => new AsyncM(_ => this._run(p)));


	// fork 'this' as a thread and return its progress 
	fork = _ => new AsyncM (async p => {
			const p1 = p.cons();
			AsyncM.timeout(0)
				.bind(_=>this)
				._run(p1)
				.finally(_ => p1.unlink()); // unlink parent to child reference after completion
			return p1; 
		    })

	// fork a list of threads
	static fork = lst => new AsyncM (async p => 
			lst.map(m => {
				const p1 = p.cons();
				AsyncM.timeout(0)
					.bind(_=>m)
					._run(p1)
					.finally(_ => p1.unlink());
				return p1;
			}))

	// pure value as AsyncM
	static pure = x => new AsyncM ( p => Promise.resolve(x) )  

	static throw = e => new AsyncM( p => Promise.reject(e) )

	// f :: (a -> (), e -> ()) -> ()
	// h :: (a -> (), e -> ()) -> ()
	// liftIO :: (f, h) -> AsyncM a
	static liftIO = (f, h) => new AsyncM (p => new Promise((k, r) => {
		let c1 = _ => { if (h) h(k1, r1); r("interrupted") }; 
		let k1 = x => {
			p.removeCanceller(c1)	
			if (!p.isPaused(_ => k(x))) k(x); 
		}
		let r1 = x => {
			p.removeCanceller(c1)	
			r(x)
		}
		if (p.isAlive()) { 
			p.addCanceller(c1);

			f(k1, r1)
		}
		else c1();
	}))

	// liftIO :: Promise a -> AsyncM a
	static liftIO_ = promise => AsyncM.liftIO((k,r) => promise.then(k).catch(r))

	// an AsyncM that never completes 
	static never = new AsyncM (p => new Promise(_ => {}))

	// completes after 'n' millisecond timeout
	static timeout = n => AsyncM.liftIO(k => setTimeout(k, n))

	static from = (elem, evt) => {
		elem = $(elem)
		return AsyncM.liftIO(k => elem.one(evt, k), 
				     k => elem.off(evt, k)) 
	}

	// cancel the current progress
	static cancel = new AsyncM (p => new Promise(k => { p.cancel(); k() }));

	// continues only if 'p' is still alive 
	static ifAlive = new AsyncM (p => new Promise((k, r) => { 
		if (p.isAlive()) { 
			k();
		}
		else {
			r("interrupted"); 
		}
	}));

	// if alive, then cancel
	static commit = AsyncM.ifAlive.bind(_ => AsyncM.cancel);

	// race two AsyncM and the winner is the one completes or throws exception first.
	static race = lst => new AsyncM (p => {
		let p1 = p.cons();
		return Promise.race(lst.map(m => m._run(p1)))
			.finally(_ => { p1.cancel(); p1.unlink(); }); 
	});

	// race two AsyncM and the winner is the one completes first.
	static any = lst => new AsyncM (p => {
		let p1 = p.cons();
		return Promise.any(lst.map(m => m._run(p1)))
			.finally(_ => { p1.cancel(); p1.unlink(); }); 
	});

	// run two AsyncM and wait for both of their results
	static all = lst => new AsyncM (p => Promise.all(lst.map(m => m.run(p))));

}


/*
 *  4. Emitter and MVar
 */

class Emitter {
	static size = 5

	constructor() {
		this.events = []; // previous events
		this.listeners = [];   // blocked listeners
	}

	// emit an event to this emitter and wait up any pending listeners
	// Emitter a -> a -> IO ()
	emit (x) {
		const evts = this.events
		evts.push(x)

		if (evts.length > Emitter.size) evts.shift()

		this.listeners.forEach(l => l(x))
		this.listeners = [];
	}

	// listen for the next event as an AsyncM
	// Emitter a -> AsyncM a
	listen = AsyncM.liftIO(
		k => this.listeners.push(k), // TODO: perhaps call k after timeout
		k => { this.listeners = this.listeners.filter(l => l!=k) }
	)

}

class MVar {
	constructor() {
		this.value = undefined;
		this.isEmpty = true;
		this.readers = []; // pending readers
		this.pending = []; // pending putters or takers 
	}

	// a -> AsyncM ()
	putAsync = x => new AsyncM(p => new Promise((k, r) => {
		if (! this.isEmpty) { 
			let k1 = _ => {
				p.removeCanceller(c1);
				this._put(x);
				setTimeout(k, 0);
			}
			let c1 = _ => {
				this.pending = this.pending.filter(writer => writer != k1);		
				r("interrupted");
			}
			p.addCanceller(c1)
			// run 'k' after timeout to simulate waking up a thread
			this.pending.push(k1) 
		}
		else {
			this._put(x);
			k();
		}
	}))

	_put = x => {
		this.isEmpty = false;
		this.value = x;

		if (this.readers.length > 0) {
			for(let i = 0; i < this.readers.length; i++ ) { this.readers[i](); }
			this.readers = [];
		}
		if (this.pending.length > 0) { this.pending.shift()(); }
	}

	// AsyncM a
	takeAsync = new AsyncM(p => new Promise((k, r) => { 
		if (this.isEmpty) { 
			let k1 = _ => {
				p.removeCanceller(c1)	
				setTimeout(_=>k(this._take()), 0)
			}
			let c1 = _ => {
				this.pending = this.pending.filter(taker => taker != k1)
				r("interrupted");
			}
			p.addCanceller(c1)
			// run 'k' after timeout to simulate waking up a thread 
			this.pending.push(k1)
		} 
		else k(this._take())
	}))

	_take = _ => { 
		this.isEmpty = true; 
		let x = this.value;

		if (this.pending.length > 0) { this.pending.shift()(); }

		return x;	
	} 

	// AsyncM a
	readAsync = new AsyncM(p => new Promise((k, r) => { 
		if (this.isEmpty) { 
			let k1 = _ => {
				p.removeCanceller(c1)	
				setTimeout(_ =>k(this.value), 0)
			}
			let c1 = _ => {
				this.readers = this.readers.filter(reader => reader != k1)
				r("interrupted")
			}
			p.addCanceller(c1)
			// run 'k' after timeout to simulate waking up a thread  
			this.readers.push(k1)
		} 
		else k(this.value)  
	}))
}


/*
 *  5. Channels
 */

// not bounded and does not support cancellation
class Channel {
	constructor() {
		this.data = [];			// data buffer
		this.listeners = [];		// reader queue
	}

	// read :: (a -> IO()) -> IO()
	read = k => {
		const d = this.data;
		if(d.length > 0) { 
			k(d.shift()); 		// read one data
		} else { 
			this.listeners.push(k); // add reader to the queue
		}
	};

	// write :: a -> IO()
	write = x => {
		const l = this.listeners;
		if(l.length > 0) {
			const k = l.shift(); 	// wake up one reader in FIFO order
			k(x);
		}
		else {
			this.data.push(x); 	// buffer if no reader in the queue
		}
	}

	readAsync = new AsyncM(p => new Promise(this.read))
	writeAsync = x => new AsyncM(p => new Promise(k => { this.write(x); k() })) 
}
 

// MVar-based bounded channel
class MChannel {
	constructor(size = Number.MAX_SAFE_INTEGER) { 
		this.size = size; // max size
		this.data = [];
		this.n = 0; // current size
		this.m = new MVar();
	}

	isEmpty = _ => this.n <= 0
	isFull = _ => this.n >= this.size

	readAsync = new AsyncM(async p => {
		let ret

		if (this.isEmpty()) {
			ret = await this.m.takeAsync.run(p)
		}
		else {
			ret = this.data.shift();
			
			if (!this.m.isEmpty) { // has pending data or writers
				let x = await this.m.takeAsync.run(p)
				this.data.push(x)
			}
			else {
				this.n = this.n - 1;
			}
		}
		return ret;
	})

	writeAsync = x => new AsyncM(async p => {
		if (this.isFull() || 
			this.m.pending.length > 0) {  // has pending readers
			await this.m.putAsync(x).run(p)
		}
		else {
			this.n = this.n + 1;
			this.data.push(x);
		}
		return
	})
}


/*
 * 5. Thread-based Streams
 *
 */


class Next { 
	constructor (value) { this.value = value; }
	isError = false
	toString () { return 'Next:' + this.value }
}
class Ended { 
	isError = false
	toString = _ => 'End' 
}
class Error {
	constructor (value) { this.value = value; }
	isError = true
	toString () { return 'Error:' + this.value }
}
const End = new Ended() 


class Observable {
	// ef :: (Emitter a, Subscription) -> AsyncM ()
	constructor(ef, name) { 
		this.ef = ef 
		this.name = name; 
	}

	static of (...lst) {
		let ef = (e, _) => new AsyncM(async p => {
			for(let i=0; i<lst.length; i++) {
				await AsyncM.timeout(0).run(p) 
				let v = new Next(lst[i]) 
				e.emit(v)
			}
			setTimeout(_ => e.emit(End), 0)
		})
		return new ColdObservable(ef, 'of')
	}

	static from (x) {
		if (x instanceof Array) {
			return Observable.of(...x).rename('from')
		}
		else if (x instanceof Promise) {
			return new ColdObservable((e, _) => new AsyncM(async p => {
				try {
					e.emit(new Next(await x))
					setTimeout(_ => e.emit(End), 0)
				}
				catch(ex) {
					e.emit(new Error(ex))
				}
			}), 'from')
		}
		else if (x instanceof String || typeof(x) == 'string') {
			return Observable.of(...x.split('')).rename('from')
		}
		else if (x instanceof Object) { // return its key/value pairs
			return Observable.of(...Object.entries(x)).rename('from')
		}
		else {
			throw "illegal argument to Observable.from: " + x
		}
	}

	// assume JQuery is imported
	static fromEvent (elem, evt) {
		let ef = (e, _) => new AsyncM(async p => {
			while(true) {
				await AsyncM.from(elem, evt)
					.bind(x => e.emit(new Next(x)))
					.run(p)
			}
		})
		return new ColdObservable(ef, 'fromEvent (' + elem + ', ' + evt + ')')	
	}

	static interval (dt) {
		let ef = (e, _) => new AsyncM(async p => {
			let n = 0
			while(true) {
				await AsyncM.timeout(dt).run(p) 
				e.emit(new Next(n++))
			}
		})
		return new ColdObservable(ef, 'interval('+dt+')')
	}

	static combineLatest (...lst) {
		let ef = (e, subscription) => new AsyncM(async p => {
			let value = lst.map(_ => undefined)
			let ready = false
			let j = 0
			let n = lst.length

			let k = (x, i) => {
				if (x == End) {
					j = j + 1; 
					if (j >= n) e.emit(End)
				}
				else {
					value[i] = x.value

					if (!ready) ready = value.reduce((c,e) => c && e != undefined, true)
					if (ready) e.emit(new Next([...value]))
				}
			}

			subscription.source = lst.map((ob,i) => ob._subscribe(x=>k(x,i), e, p))
		})
		
		return new ColdObservable(ef, 'combineLatest')
	}

	combineAll () {
		let ef = (e, subscription) => new AsyncM(async p => {
			let lst = []
			let k = x => {
				if (x != End) lst.push(x.value)
				else {
					subscription.child = Observable.combineLatest(...lst)._subscribe(x => e.emit(x), e, p)
				}
			}

			subscription.source = this._subscribe(x=>k(x), e, p)
		})

		return new ColdObservable(ef, 'combineAll')
	}

	static concat (...lst) {
		let ef = (e, subscription) => new AsyncM(async p => {
			subscription.source = []

			let k = x => {
				if (x != End || lst.length == 0) 
					e.emit(x)

				if (x == End && lst.length > 0) 
					subscription.source.push(lst.shift()._subscribe(k, e, p))
			}
			subscription.source.push(lst.shift()._subscribe(k, e, p))
		})

		return new ColdObservable(ef, 'concat')
	}

	distinctUntilChanged () {
		let ef = (e, subscription) => new AsyncM(async p => {
			let previous;

			let k = x => {
				if (x == End) e.emit(End)
				else if (x.value != previous) {
					previous = x.value
					e.emit(x)
				}
			}

			subscription.source = this._subscribe(k, e, p)
		})
		return new ColdObservable(ef, 'distinctUntilChanged')
	}

	debounceTime (dt) {
		let ef = (e, subscription) => new AsyncM(async p => {
			let p1 = null
			let ending = false

			let k = x => {
				if (x == End) ending = true
				else {
					if (p1) p1.cancel()
					p1 = p.cons()
					AsyncM.timeout(dt).bind(_ => {
						e.emit(x)
						if(ending) e.emit(End)
					})._run(p1).finally(_=>p1.unlink())
				}
			}

			subscription.source = this._subscribe(k, e, p)
		})
		return new ColdObservable(ef, 'debounceTime(' + dt + ')')
	}

	// buffer the observables using a channel
	concatAll () {
		let ef = (e, subscription) => new AsyncM(async p => {
			let ch = new MChannel() // TODO: add a buffer size parameter

			subscription.source = this._subscribe(x => ch.writeAsync(x).run(p), e, p)

			let x = await ch.readAsync.run(p)	
			let k = y => {
				if (y == End) {	
					ch.readAsync.bind(x => {
						if (x == End) e.emit(End)
						else subscription.child = x.value._subscribe(k, e, p)
					})._run(p)
				}
				else e.emit(y)
			}
			if (x == End) e.emit(End)
			else subscription.child = x.value._subscribe(k, e, p)
		})
		return new ColdObservable(ef, 'concatAll')
	}

	map (f) { return this.fmap(f).rename('map') }

	concatMap (f) { return this.fmap(f).concatAll() } 

	switchMap (f) { return this.bind(f).rename('switchMap') }

	exhaustMap (f) {
		let ef = (e, subscription) => new AsyncM(async p => {
			let ready = true

			subscription.source = this._subscribe(x => {
				if (x == End) e.emit(End)
				else if (ready) {
					ready = false

					subscription.child = f(x.value)._subscribe(y => {
						if (y == End) ready = true; else e.emit(y)
					}, e, p)
				}
			}, e, p)
		})
		
		return new ColdObservable(ef, 'exhaustMap') 	
	}

	static merge (...lst) {
		let ef = (e, subscription) => new AsyncM(async p => {
			let i = 0
			let n = lst.length

			let k = x => {
				if (x == End) i = i + 1; else e.emit(x)

				if (i >= n) e.emit(End)
			}

			subscription.source = lst.map(ob => ob._subscribe(k, e, p))
		})

		return new ColdObservable(ef, 'merge')
	}

	mergeAll () {
		let ef = (e, subscription) => new AsyncM(async p => {
			let ending = false
			let count = 0

			let k = x => {
				if (x == End) {
					ending = true 
					return
				}

				count = count + 1

				let k1 = y => {
					if (y == End) count = count - 1; else e.emit(y)
					if (ending && count <= 0) e.emit(End)
				}
				x.value._subscribe(k1, e, p)
			}

			subscription.source = this._subscribe(k, e, p)
		})

		return new ColdObservable(ef, 'mergeAll')
	}

	mergeMap (f) { return this.fmap(f).mergeAll() }

	take (size) {
		let ef = (e, subscription) => new AsyncM(async p => {
			let n = size
			let k = x => {
				if (n <= 0) { 
					subscription.source.unsubscribe() 
					e.emit(End)
				}
				else {
					n = n - 1;
					e.emit(x); 
				}
			}

			subscription.source = this._subscribe(k, e, p)
		})
		return new ColdObservable(ef, 'take(' + size + ')') 	
	}

	filter (f) {
		let ef = (e, subscription) => new AsyncM(async p => {
			subscription.source = this._subscribe(x => {
				try {
					if (x == End) e.emit(End); else if (f(x.value)) e.emit(x)
				}
				catch (ex) {
					e.emit(new Error(ex))
				}
			}, e, p) 
		})
		return new ColdObservable(ef, 'filter') 	
	}

	tap (f) {
		let ef = (e, subscription) => new AsyncM(async p => {
			subscription.source = this._subscribe(x => {
				try {
					if (x == End) e.emit(End); else { f(x.value); e.emit(x) }
				}
				catch (ex) {
					e.emit(new Error(ex))
				}
			}, e, p) 
		})
		return new ColdObservable(ef, 'tap') 	
	}

	fmap (f) {
		let ef = (e, subscription) => new AsyncM(async p => {
			subscription.source = this._subscribe(x => {
				try {
					e.emit(x == End? End : new Next(f(x.value)))
				}
				catch (ex) {
					e.emit(new Error(ex))
				}
			}, e, p) 
		})
		return new ColdObservable(ef, 'fmap') 	
	}

	bind (f) {
		let ef = (e, subscription) => new AsyncM(async p => {
			let ending = false

			subscription.source = this._subscribe(x => {
				if (x == End) {
					if (ending) e.emit(End); else ending = true
				}
				else {
					ending = false
					if (subscription.child) subscription.child.unsubscribe()
					try {
						subscription.child = f(x.value)._subscribe(y => {
							if (y == End) {
								if (ending) e.emit(End); else ending = true
							}
							else e.emit(y)
						}, e, p)
					}
					catch (ex) {
						e.emit(new Error(ex))
					}
				}
			}, e, p)
		})
		
		return new ColdObservable(ef, 'bind') 	
	}

	// f :: Error -> Observable a
	catchError (f) {
		let ef = (e, subscription) => new AsyncM(async p => {
			let h = x => {
				try {
					let ob = f(x.value)
					subscription.source.unsubscribe()
					subscription.source = ob._subscribe(x => e.emit(x), e, p)
				}
				catch (ex) {
					e.emit(new Error(ex))
				}
			}
			subscription.source = this._subscribe(x => e.emit(x), {emit: h}, p)
		})

		return new ColdObservable(ef, 'catchError') 	
	}

	retry (times) {
		let ef = (e, subscription) => new AsyncM(async p => {
			let n = times
			let h = x => {
				if (n > 0) {
					n = n - 1
					subscription.source.unsubscribe()
					subscription.source = this._subscribe(x => e.emit(x), {emit: h}, p)
				}
				else {
					e.emit(x)
				}
			}
			subscription.source = this._subscribe(x => e.emit(x), {emit: h}, p)
		})

		return new ColdObservable(ef, 'retry(' + times + ')') 			
	}

	// accumulator :: (c, e) -> c
	// seed :: c
	scan(accumulator, seed) {
		let ef = (e, subscription) => new AsyncM(async p => {
			let c = seed
			subscription.source = this._subscribe(
				x => {
					if (x == End) e.emit(End)
					else { 
						try {
							c = accumulator(c, x.value)
							e.emit(new Next(c))
						} 
						catch (ex) {
							e.emit(new Error(ex))
						}
					}
				},
				{emit: x => e.emit(x)},
				p
			)
		})
		return new ColdObservable(ef, 'scan') 			
	}

	// lst :: [Instance Method of Observable]
	pipe (...lst) {
		let ob = this
		for(let f of lst) { ob = f(ob) }
		return ob
	}

	subscribe (k=x=>x, complete, error=console.log) {
		let next = k

		if (typeof(k) == 'object') {
			if(k.next) next = k.next
			if(k.complete) complete = k.complete
			if(k.error) error = k.error
		}
		let p = new Progress()
		let e = {emit: x => {
			p.cancel()
			p.unlink()
			error(x.value)
		}}
		return this._subscribe(x => { 
			if (x == End) {
				if (complete) complete()
				p.unlink()
			}
			else next(x.value)
		}, e , p)
	}

	// (Emitter a, a -> (), Error -> ()) -> AsyncM ()
	_listen (e1, k, h) {
		return new AsyncM(async p => {
			let x
			do {
				x = await e1.listen.run(p)

				if (x.isError) h(x); else k(x)
			} 
			while (x != End)
		})
	}
}
 
class ColdObservable extends Observable {
	constructor(ef, name) { super (ef, name) }

	rename(name) { this.name = name; return this }

	_subscribe(k, e, p) {
		let e1 = new Emitter()
		let p1 = p.cons()
		let s = new Subscription(this.name, e1, p1)

		this.ef(e1, s)._run(p1)
		this._listen(e1, k, x => e.emit(x))._run(p1).finally(_ => p1.unlink())

		return s
	}

	share() { return new HotObservable(this.ef, this.name) }
}

class HotObservable extends Observable {
	constructor(ef, name) { 
		super(ef, name); 
		this.n = 0
		this.subscription = null
	}

	_subscribe(k, e, p) {
		this.n = this.n + 1
		let sub = this.subscription

		// start the hot observable if this is the first subscription
		if(this.n == 1) {
			this.subscription = sub = new Subscription(this.name, new Emitter(), new Progress())
			this.ef(sub.emitter, sub)
				._run(sub.progress)
				.finally(_ => sub.progress.unlink())
		}

		let p1 = p.cons()
		p1.addCanceller(_ => {if (-- this.n <= 0) sub.progress.cancel()})
		this._listen(sub.emitter, k, x => e.emit(x))._run(p1).finally(_ => p1.unlink())

		return new Subscription('share', null, p1, sub)
	}

	share() { return this }
}

class Subscription {
	constructor(name, emitter, progress, source=null, child=null) {
		this.name = name
		this.emitter = emitter 
		this.progress = progress
		this.source = source 
		this.child = child
	}

	unsubscribe() { this.progress.cancel() }

	toString() {
		let lst = [this.name]
		if (this.emitter) lst.push(this.emitter.events.toString())
		if (this.source) lst.push(this.source.toString())
		if (this.child) lst.push(this.child.toString())
		return '['+lst.join(',')+']'
	}
}

// short names for 7 static methods
const of            = Observable.of 
const from          = Observable.from 
const fromEvent     = Observable.fromEvent 
const interval      = Observable.interval 
const combineLatest = Observable.combineLatest 
const concat        = Observable.concat 
const merge         = Observable.merge 

const make = f => (...args) => ob => f.apply(ob, args)

// short names for 16 instance methods -- can only used through pipe method call
const retry      = make(Observable.prototype.retry)
const catchError = make(Observable.prototype.catchError)
const filter     = make(Observable.prototype.filter)
const map        = make(Observable.prototype.map)
const switchMap  = make(Observable.prototype.switchMap)
const take       = make(Observable.prototype.take)
const mergeMap   = make(Observable.prototype.mergeMap)
const mergeAll   = make(Observable.prototype.mergeAll)
const exhaustMap = make(Observable.prototype.exhaustMap)
const concatMap  = make(Observable.prototype.concatMap)
const concatAll  = make(Observable.prototype.concatAll)
const combineAll = make(Observable.prototype.combineAll)
const distinctUntilChanged = make(Observable.prototype.distinctUntilChanged)
const debounceTime = make(Observable.prototype.debounceTime)
const tap        = make(Observable.prototype.tap)
const scan       = make(Observable.prototype.scan)

 
