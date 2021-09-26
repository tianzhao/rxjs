
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
			// TODO: thread cancellation is synchronous, 
			// which is important for timely concellation
			// since we don't want the cancelled thread to perform any action 
			// between the cancellation request and the run of the canceller.
			this.cancellers.forEach(c => c()); // setTimeout(c, 0)); 
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
	static pure  = x => new AsyncM(p => Promise.resolve(x))  

	static throw = e => new AsyncM(p => Promise.reject(e))

	// f :: (a -> (), e -> ()) -> ()
	// h :: (a -> ()) -> ()
	// lift :: (f, h) -> AsyncM a
	static lift = (f, h) => new AsyncM (p => new Promise((k, r) => {
		// run 'f' only if 'p' is alive
		if (p.isAlive()) { 
			let c = _ => { 
				if (h) h(k1) 
				r('interrupted') 
			} 
			let k1 = x => {
				p.removeCanceller(c)	
				if (!p.isPaused(_ => k(x))) k(x) 
			}
			let r1 = x => {
				p.removeCanceller(c)	
				r(x)
			}

			p.addCanceller(c);
			f(k1, r1)
		}
		else r('interrupted')
	}))

	// lift :: Promise a -> AsyncM a
	static _lift = promise => AsyncM.lift((k,r) => promise.then(k).catch(r))

	// an AsyncM that never completes 
	static never = new AsyncM (p => new Promise(_ => {}))

	// timeout after 'n' millisecond 
	static timeout = n => {
		let timer
		let f = k => { timer = setTimeout(k, n) }
		let h = _ => { if (timer) clearTimeout(timer) }
		return AsyncM.lift(f, h)
	}

	static from = (elem, evt) => {
		elem = $(elem)
		return AsyncM.lift(k => elem.one(evt, k), 
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

		// FIXME: cannot use timeout to isolate the source/target of the events
		this.listeners.forEach(l => l(x)) 
		this.listeners = [];
	}

	// listen for the next event as an AsyncM
	// Emitter a -> AsyncM a
	listen = AsyncM.lift(
		k => this.listeners.push(k), 
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
	toString () { return 'Next:' + this.value }
}
class Ended { 
	toString () { return 'End' } 
}
class Error {
	constructor (value) { this.value = value; }
	toString () { return 'Error:' + this.value }
}
const End = new Ended() 


class Observable {
	// ef :: (Emitter a, Subscription) -> AsyncM ()
	constructor(ef, name) { 
		this.ef = ef 
		this.name = name; 
	}

	static _next(e, x) { return AsyncM.timeout(0).fmap(_ => e.emit(new Next(x))) }
	static _complete(e) { return AsyncM.timeout(0).fmap(_ => e.emit(End)) }
	static _error(e, ex) { return AsyncM.timeout(0).fmap(_ => e.emit(new Error(ex))) }

	/*
	 * Combination operators
	 */
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

		return new Observable(ef, 'combineAll')
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
		
		return new Observable(ef, 'combineLatest')
	}

	static concat (...lst) {
		/*
		let ef = (e, subscription) => new AsyncM(async p => {
			subscription.source = []

			let k = x => {
				if (x != End || lst.length == 0) 
					e.emit(x)

				if (x == End && lst.length > 0) // && p.isAlive()) 
					subscription.source.push(lst.shift()._subscribe(k, e, p))
			}
			subscription.source.push(lst.shift()._subscribe(k, e, p))
		})

		return new Observable(ef, 'concat')
		*/
		return Observable.of(...lst).concatAll().rename('concat')
	}

	// buffer the observables using a channel
	concatAll () {
		let ef = (e, subscription) => new AsyncM(async p => {
			let ch = new MChannel() // TODO: add a buffer size parameter

			subscription.source = this._subscribe(x => ch.writeAsync(x)._run(p), e, p)

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
		return new Observable(ef, 'concatAll')
	}

	endWith (...lst) { return Observable.concat(this, Observable.of(...lst)).rename('endWith') }

	static forkJoin (...lst) {
		let ef = (e, subscription) => new AsyncM(async p => {
			let keys
			let value = lst.map(_ => undefined)

			if (lst.length == 1) {
				if (lst[0] instanceof Array) {
					lst = lst[0]
					value = lst.map(_ => undefined)
				}
				else if (lst[0] instanceof Object) {
					keys = Object.keys(lst[0])
					lst = Object.values(lst[0])
					value = {}
				}
			}

			let j = 0
			let n = lst.length

			let k = (x, i) => {
				if (x == End) {
					j = j + 1; 

					if (j >= n) {
						e.emit(new Next(value))
						e.emit(End)
					}
				}
				else {
					if (keys) { i = keys[i] }

					value[i] = x.value
				}
			}

			subscription.source = lst.map((ob,i) => ob._subscribe(x=>k(x,i), e, p))
		})
		
		return new Observable(ef, 'forkJoin')
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

		return new Observable(ef, 'merge')
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

		return new Observable(ef, 'mergeAll')
	}

	
	pairwise () {
		let ef = (e, subscription) => new AsyncM(async p => {
			let previous = undefined

			let k = x => {
				if (x == End) { e.emit(x) }
				else {
					if (previous != undefined) {
						e.emit(new Next([previous, x.value]))
					}
					previous = x.value
				}
			}

			subscription.source = this._subscribe(k, e, p)
		})

		return new Observable(ef, 'pairwise')
	}

	static race (...lst) {
		let ef = (e, subscription) => new AsyncM(async p => {
			let won = false
			let k = (x, i) => {
				if (! won) {
					subscription.source.forEach((sub, j) => {
						if (j != i) sub.unsubscribe()
					})
					won = true
				}
				e.emit(x)
			}

			subscription.source = lst.map((ob, i) => ob._subscribe(x => k(x, i), e, p))
		})

		return new Observable(ef, 'race')
	}

	race (...lst) { return Observable.race(this, ...lst) }

	startWith (...lst) { return Observable.concat(Observable.of(...lst), this).rename('startWith') }

	withLatestFrom (ob) {
		let ef = (e, subscription) => new AsyncM(async p => {
			let latest = undefined 

			let k = x => {
				if (x == End) { // source ends
					e.emit(End); 
					subscription.child.unsubscribe();
				}
				else if (latest) {
					e.emit(new Next([x.value, latest.value]))
				}
			}

			let k1 = y => { if (y != End) latest = y }

			subscription.child = ob._subscribe(k1, e, p)
			subscription.source = this._subscribe(k, e, p)
		})
		
		return new Observable(ef, 'withLatestFrom')
	}

	static zip (...lst) {
		let ef = (e, subscription) => new AsyncM(async p => {
			let channels = lst.map(_ => new MChannel())

			subscription.source = lst.map(
				(ob, i) => ob._subscribe(x => channels[i].writeAsync(x)._run(p), e, p)
			)

			let ended = false
			while (! ended) {
				let f = ch => ch.readAsync.bind(
					x => (x == End) ? AsyncM.throw(x) : AsyncM.pure(x)
				)

				let y = await AsyncM.all(channels.map(f)).catch(e => End).run(p)

				if (y == End) {
					subscription.source.forEach(sub => sub.unsubscribe())
					ended = true
				}
				if (ended) e.emit(End); else e.emit(new Next(y.map(z => z.value))) 
			}
		})
		return new Observable(ef, 'zip')
	}

	/*
	 * Conditional operators
	 */

	defaultIfEmpty (d) {
		let ef = (e, subscription) => new AsyncM(async p => {
			let previous = false;

			let k = x => {
				if (! previous) {
					previous = true 
					if (x == End) {
						e.emit(new Next(d)) 
						Observable._complete(e)._run(p)
					}
					else e.emit(x)
				}
				else e.emit(x)
			}

			subscription.source = this._subscribe(k, e, p)
		})
		return new Observable(ef, 'defaultIfEmpty')
	}

	every (predicate, thisArg) {
		let ef = (e, subscription) => new AsyncM(async p => {
			let index = 0
			
			let k = x => {
				if (x == End) {
					e.emit(new Next(true))
					Observable._complete(e)._run(p)
				}
				else {
					if(! predicate.call(thisArg, x.value, index++, this)) {
						subscription.source.unsubscribe()
						e.emit(new Next(false))
						Observable._complete(e)._run(p)
					}
				}
			}
			subscription.source = this._subscribe(k, e, p)
		})
		return new Observable(ef, 'every')
	}

	static iif (condition, trueResult = Observable.empty(), falseResult = Observable.empty()) {
		return condition() ? trueResult : falseResult 
	}

	sequenceEqual(compareTo, comparator = (a,b)=>(a==b)) {
		let ef = (e, subscription) => new AsyncM(async p => {
			let lst = [this, compareTo]

			let channels = lst.map(_ => new MChannel())

			subscription.source = lst.map((ob, i) => ob._subscribe(x => channels[i].writeAsync(x)._run(p), e, p))

			let ended = false
			while (! ended) {
				let y = await AsyncM.all(channels.map(ch => ch.readAsync)).run(p)

				if(y[0] == End && y[1] == End) { 
					e.emit(new Next(true))
					await Observable._complete(e).run(p)
				}
				else if (y[0] != End && y[1] != End && comparator(y[0].value, y[1].value)) { }
				else {
					e.emit(new Next(false))
					subscription.source.forEach(sub => sub.unsubscribe())
					await Observable._complete(e).run(p)
				}
			}
		})
		return new Observable(ef, 'sequenceEqual')
	}

	/*
	 * Creation
	 */

	// assume JQuery is imported
	static ajax (url) {
		return Observable.from(new Promise((k,r)=>$.when($.ajax(url)).then(k).catch(r))).rename('ajax')
	}

	static create (subscribe) {
		let ef = (e, _) => new AsyncM(async p => {
			let k = {}
			k.next     = x => Observable._next(e, x)._run(p)
			k.complete = _ => Observable._complete(e)._run(p)
			k.error    = x => Observable._error(e, x)._run(p) 
			subscribe(k)
		})
		return new Observable(ef, 'create')
	}

	static defer (observableFactory) {
		let ef = (e, subscription) => observableFactory().ef(e, subscription)
		return new Observable(ef, 'defer')
	}

	static empty () { return Observable.of().rename('empty') }

	static from (x) {
		if (x instanceof Promise) {
			return new Observable((e, _) => new AsyncM(async p => {
				try {
					let y = await AsyncM._lift(x).run(p) // make x interruptible
					e.emit(new Next(y))
					await Observable._complete(e).run(p)
				}
				catch(ex) {
					e.emit(new Error(ex))
				}
			}), 'from')
		}
		else if (x instanceof Array) {
			return Observable.of(...x).rename('from')
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
		return new Observable(ef, `fromEvent (${elem}, ${evt})`)	
	}

	// emit 'n' starting from 'x' for each 'dt' millisecond 
	static interval = (dt, x=0) => {
		let ef = (e, _) => new AsyncM(p => new Promise((_, r) => {
			let n = x

			let timer = setInterval(_ => e.emit(new Next(n++)), dt)
			p.addCanceller(_ => { clearInterval(timer); r('interrupted') }) 
		}))
		return new Observable(ef, `interval(${dt})`)
	}

	static generate(init, cond, inc, proj = x=>x) {
		let ef = (e, _) => new AsyncM(async p => {	
			let x = init
			while(cond && cond(x)) {
				await Observable._next(e, proj(x)).run(p)
				x = inc(x)
			}
			await Observable._complete(e).run(p)
		})
		return new Observable(ef, 'generate')
	}

	static range(low, high) {
		return Observable.generate(low, x=> x<=high, x=>x+1).rename(`range(${low}, ${high})`)
	}

	// FIXME: this is always asynchronous -- doens't work with switchMap 
	static of (...lst) {
		let ef = (e, _) => new AsyncM(async p => {
			for(let i=0; i<lst.length; i++) {
				await Observable._next(e, lst[i]).run(p)
			}
			await Observable._complete(e).run(p)
		})
		return new Observable(ef, 'of')
	}

	static throwError (ex) { return Observable.of(null).map(_ => { throw ex }).rename('throwError') }

	static timer(d, dt) {
		let ef = (e, _) => AsyncM.timeout(d)
			.bind(_ => { 
				e.emit(new Next(0)) 
				return (dt == undefined) ? Observable._complete(e) : Observable.interval(dt, 1).ef(e, undefined)
			})
		return new Observable(ef, `timer (${d}${dt != undefined ? `, ${dt}` : ''})`)		
	}

	/*
	 * Error handling
	 */

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

		return new Observable(ef, 'catchError') 	
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

		return new Observable(ef, 'retry(' + times + ')') 			
	}


	retryWhen (notifier) {
		let ef = (e, subscription) => new AsyncM(async p => {
			let h = x => {
				subscription.source.unsubscribe()
				subscription.child = notifier(Observable.of(x.value))._subscribe(y => {
					if (y == End) e.emit(End)
					else {
						subscription.child.unsubscribe()
						subscription.source = this._subscribe(x => e.emit(x), {emit: h}, p)
					}
				}, e, p)
			}
			subscription.source = this._subscribe(x => e.emit(x), {emit: h}, p)
		})

		return new Observable(ef, 'retryWhen') 			
	}

	/*
	 * Multicasting
	 */
	
	publish (selector) { 
		let subject = new Subject(this) 
		if(selector) {
			subject.connect()
			return selector(subject)
		}
		else return subject
	}

	multicast (selector) {
		let subject = selector // selector may be a subject or a function that returns a subject 
		if (selector instanceof Function) { subject = selector() }
		subject.observable = this
		return subject
	}
	
	share () { return new RefCountSubject(this) }

	shareReplay (bufferSize, windowTime) { 
		let refCount = false
		if (bufferSize instanceof Object) {
			let c = bufferSize
			refCount = c.refCount	
			bufferSize = c.bufferSize
			windowTime = c.windowTime
		}
		return new ReplaySubject(bufferSize, refCount, this) 
	}

	/*
	 * Filtering
	 */

	audit (selector) { return this.throttle(selector, {auditing: true}).rename('audit') }

	auditTime (dt) { return this.audit(_ => Observable.timer(dt)).rename(`auditTime(${dt})`) } 

	debounce(selector) {
		let ef = (e, subscription) => new AsyncM(async p => {
			let sub
			let latest

			let k = x => {
				if (sub) sub.unsubscribe()

				if (x == End) {
					if (latest) e.emit(latest)
					Observable._complete(e)._run(p)
				}
				else {
					latest = x

					sub = selector(x.value)._subscribe(_ => {
						sub.unsubscribe()
						e.emit(latest)
					}, e, p)
				}
			}

			subscription.source = this._subscribe(k, e, p)
		})
		return new Observable(ef, 'debounce()')
	}

	debounceTime (dt) {
		return this.debounce(_ => timer(dt)).rename('debounceTime(' + dt + ')')
	}

	distinct (keySelector = x => x, flush) {
		let ef = (e, subscription) => new AsyncM(async p => {
			let cache = new Set()

			let k = x => {
				if (x == End) {
					cache.clear() 
					e.emit(End)
				}
				else {
					let y = keySelector(x.value)

					if (! cache.has(y)) {
						cache.add(y)
						e.emit(x)
					}
				}
			}

			if (flush instanceof Observable) flush._subscribe(_ => cache.clear(), e, p)

			subscription.source = this._subscribe(k, e, p)
		})
		return new Observable(ef, 'distinct')		
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
		return new Observable(ef, 'distinctUntilChanged')
	}

	distinctUntilKeyChanged (key, compare = (a,b) => a == b) {
		let ef = (e, subscription) => new AsyncM(async p => {
			let previous;

			let k = x => {
				if (x == End) e.emit(End)
				else if (previous == undefined || ! compare(x.value[key], previous)) {
					previous = x.value[key]
					e.emit(x)
				}
			}

			subscription.source = this._subscribe(k, e, p)
		})
		return new Observable(ef, 'distinctUntilKeyChanged')
	}

	filter (predicate) {
		let ef = (e, subscription) => new AsyncM(async p => {
			subscription.source = this._subscribe(x => {
				try {
					if (x == End) e.emit(End); else if (predicate(x.value)) e.emit(x)
				}
				catch (ex) {
					e.emit(new Error(ex))
				}
			}, e, p) 
		})
		return new Observable(ef, 'filter') 	
	}

	find (predicate) { return this.filter(predicate).take(1).rename('find') }

	first (predicate = _ => true, defaultValue) {
		let ef = (e, subscription) => new AsyncM(async p => {
			let f = x => {
				e.emit(x)
				Observable._complete(e)._run(p)
				subscription.source.unsubscribe()
			}
			subscription.source = this._subscribe(x => {
				if (x == End) {
					if (defaultValue) f(new Next(defaultValue))
					else e.emit(new Error('No first event'));
				}
				else if (predicate(x.value)) f(x)
			}, e, p) 
		})
		return new Observable(ef, 'first') 		
	}

	ignoreElements () {
		let ef = (e, subscription) => new AsyncM(async p => {
			subscription.source = this._subscribe(x => {
				if (x == End) { e.emit(End) }
			}, e, p) 
		})
		return new Observable(ef, 'ignoreElements') 
	}

	last (predicate = _ => true, defaultValue) {
		let ef = (e, subscription) => new AsyncM(async p => {
			let last

			let f = x => {
				e.emit(x)
				Observable._complete(e)._run(p)
				subscription.source.unsubscribe()
			}
			subscription.source = this._subscribe(x => {
				if (x == End) {
					if (last) f(last) 
					else if (defaultValue) f(new Next(defaultValue))
					else e.emit(new Error('No last event'));
				}
				else if (predicate(x.value)) {
					last = x
				}
			}, e, p) 
		})
		return new Observable(ef, 'last') 
	}

	sample (sampler) { 
		let ef = (e, subscription) => new AsyncM(async p => {
			let latest = undefined 
			let updated = false

			let k = x => {
				if (x == End) { // sampler ends
					subscription.source.unsubscribe()
					e.emit(End); 
				}
				else if (latest && updated) {
					updated = false
					e.emit(latest)
				}
			}

			let k1 = y => { 
				if (y == End) { // source ends
					subscription.child.unsubscribe()
					e.emit(End)
				}
				else {
					latest = y 
					updated = true
				}
			}

			subscription.source = this._subscribe(k1, e, p)
			subscription.child = sampler._subscribe(k, e, p)
		})
		
		return new Observable(ef, 'sampler')
	}

	skip (size) {
		let ef = (e, subscription) => new AsyncM(async p => {
			let n = size
			let k = x => {
				if (x == End) e.emit(End)
				else if (n <= 0) { e.emit(x) } 
				else { n = n - 1; }
			}

			subscription.source = this._subscribe(k, e, p)
		})
		return new Observable(ef, 'skip(' + size + ')') 	
	}

	take (size) {
		let ef = (e, subscription) => new AsyncM(async p => {
			let n = size
			let k = x => {
				if (n <= 1) { 
					subscription.source.unsubscribe() 
					if (n == 1) e.emit(x)	
					Observable._complete(e)._run(p)
				}
				else {
					n = n - 1;
					e.emit(x); 
				}
			}

			subscription.source = this._subscribe(k, e, p)
		})
		return new Observable(ef, 'take(' + size + ')') 	
	}

	takeUntil (ob) {
		let ef = (e, subscription) => new AsyncM(async p => {
			subscription.source = this._subscribe(x => {
				if (x == End) subscription.child.unsubscribe() 
				e.emit(x)
			}, e, p)
			subscription.child = ob._subscribe(_ => {
				subscription.source.unsubscribe()
				e.emit(End)
			}, e, p)
		})
		return new Observable(ef, 'takeUntil') 	
	}

	throttle (selector, config) { 
		let ef = (e, subscription) => new AsyncM(async p => {
			let masked = false
			let leading = true
			let trailing = false
			let auditing = false

			if (config) {
				leading = config.leading
				trailing = config.trailing
				auditing = config.auditing
			}

			let trailingEvent
			let auditingEvent
			let sub

			let k = x => {
				if (x == End) {
					if (sub) sub.unsubscribe()
					if (trailing && trailingEvent) {
						e.emit(trailingEvent)
						Observable._complete(e)._run(p)
					}
					else e.emit(End)
				}
				else {
					if (auditing) auditingEvent = x

					if (! masked) {
						masked = true
						if (trailing) trailingEvent = undefined

						sub = selector(x.value)._subscribe(_ => {
							sub.unsubscribe()
							masked = false
							if (trailing && trailingEvent) e.emit(trailingEvent)
							if (auditing && auditingEvent) e.emit(auditingEvent)
						}, e, p)

						if (leading) e.emit(x)
					}
					else if (trailing) trailingEvent = x 
				}
			}

			subscription.source = this._subscribe(k, e, p)
		})
		return new Observable(ef, `throttle()`)
	
	}

	// scheduler is not used
	throttleTime (dt, config) { 
		return this.throttle(_ => Observable.timer(dt), config).rename(`throttleTime(${dt})`) 
	}

	/*
	 * Transformation
	 */

	concatMap (f) { return this.fmap(f).concatAll() } 

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
		
		return new Observable(ef, 'exhaustMap') 	
	}

	map (f) { return this.fmap(f).rename('map') }

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
		return new Observable(ef, 'fmap') 	
	}

	mapTo(x) { return this.fmap(_ => x).rename('mapTo') }

	mergeMap (f) { return this.fmap(f).mergeAll().rename('mergeMap') }

	pluck(...lst) { return this.fmap(x => lst.reduce((c, e) => (c && c[e]) ? c[e] : undefined, x)).rename('pluck') }

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
							if (c == undefined) c = x.value; else c = accumulator(c, x.value)
							
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
		return new Observable(ef, 'scan') 			
	}

	switchMap (f) { return this.bind(f).rename('switchMap') }

	bind (f) {
		let ef = (e, subscription) => new AsyncM(async p => {
			let ending = true

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
		
		return new Observable(ef, 'bind') 	
	}

	/*
	 * Utility
	 */

	tap (f, error, complete) {
		if (f.next) {
			error = f.error
			complete = f.complete
			f = f.next
		}
		let ef = (e, subscription) => new AsyncM(async p => {
			subscription.source = this._subscribe(x => {
				try {
					if (x == End) {
						if (complete) complete(End);
						e.emit(End); 
					}
					else { 
						f(x.value); 
						e.emit(x) 
					}
				}
				catch (ex) {
					e.emit(new Error(ex))
				}
			}, 
			{emit: x => {
				if (error) error(x.value)	
				e.emit(x)
			}}, 
			p ) 
		})
		return new Observable(ef, 'tap') 	
	}


	delay (dt) {
		if(dt instanceof Date) {
			dt = new Date - dt	
		}
		let ef = (e, subscription) => new AsyncM(async p => {
			subscription.source = this._subscribe(x => {
				AsyncM.timeout(dt).fmap(_ => e.emit(x))._run(p)
			}, e, p)
		})
		return new Observable(ef, 'delay') 	
	}

	delayWhen (selector) {
		let ef = (e, subscription) => new AsyncM(async p => {
			let ending = false
			subscription.source = this._subscribe(x => {
				if (x == End) {
					if (subscription.child) ending = true; else e.emit(End)
				}
				else {
					subscription.child = selector(x.value)._subscribe(_ => {
						subscription.child.unsubscribe()
						e.emit(x)
						if (ending) e.emit(End)
					}, e, p)
				}
			}, e, p)
		})
		return new Observable(ef, 'delayWhen') 			
	}

	finalize (h) {
		let ef = (e, subscription) => new AsyncM(async p => {
			subscription.source = this._subscribe(x => e.emit(x), e, p, h)
		})
		return new Observable(ef, 'finalize') 					
	}


	// lst :: [Instance Method of Observable]
	pipe (...lst) { return lst.reduce((ob, f) => f(ob), this) }

	rename (name) { this.name = name; return this }

	subscribe (k=x=>x, error=console.log, complete) {
		let next = k

		if (typeof(k) == 'object') {
			if(k.next) next = k.next
			if(k.complete) complete = k.complete
			if(k.error) error = k.error
		}
		let p = new Progress()
		let e = {emit: x => {
			p.cancel()
			error(x.value)
		}}
		return this._subscribe(x => { 
			if (x == End) {
				if (complete) complete()
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
				if (x instanceof Next && x.value instanceof Promise) 
					x.value = Observable.from(x.value)
				if (x instanceof Error) h(x); else k(x)
			} 
			while (x != End)
		})
	}

	// k: a => (), e :: Emitter a, f :: Progress, f :: finalizer
	_subscribe(k, e, p, f) {
		let e1 = new Emitter()
		let p1 = p.cons()
		let s = new Subscription(this.name, e1, p1)

		let f1 = _ => { if (f) f(); p1.unlink() }
		this._listen(e1, k, x => e.emit(x))._run(p1).finally(f1)
		this.ef(e1, s)._run(p1)

		return s
	}
}

class Subject extends Observable {
	constructor(observable) { 
		super((e, subscription) => {
			if (this.subscribers.length == 0) this._first()

			this._addObserver(subscription)

			return new AsyncM(async p => p.addCanceller(_ => this._removeObserver(subscription)))
		}, 'Subject') 

		this.subscribers = []
		this.observable = observable
		this.connected = false
	}

	_first() {}
	_last () {}

	_addObserver(subscription) { 
		this.subscribers.push(subscription) 
		subscription.source = this
	}

	_removeObserver(subscription) {
		this.subscribers = this.subscribers.filter(s => s != subscription)
		if (this.subscribers.length == 0) this._last()
	}

	// synchronous firing is not compatible with asynchronous listening
	_fire(x) { for (let s of this.subscribers) { s.emitter.emit(x) } }

	next(x) { this._fire(new Next(x)) }
	complete() { this._fire(End) }
	error(x) { this._fire(new Error(x)) }

	connect() {
		if (! this.connected) {
			this.connected = true
			this.source = this.observable._subscribe(
				x => this._fire(x), 
				{emit: x => this._fire(x)}, 
				new Progress()
			) 	
		}
	}
	unsubscribe () { 
		if (this.connected) {
			this.connected = false
			this.source.unsubscribe() 
		}
	}
}

class RefCountSubject extends Subject {
	// @Override
	_first() { this.connect() }

	// @Override
	_last () { this.unsubscribe() }
}

class ReplaySubject extends RefCountSubject {
	constructor(bufferSize, refCount, observable) { 
		super(observable)
		this.bufferSize = bufferSize
		this.refCount = refCount
		this.buffer = []
		this.size = 0
	}

	_addBuffer(x) { 
		if (this.size >= this.bufferSize) this.buffer.shift()
		this.buffer.push(x)
	}

	// @Overrride
	_fire(x) { 
		this._addBuffer(x)
		super._fire(x)
	}

	// @Override
	_addObserver(subscription) {
		// TODO: check whether asynchronous firing is necessary
		new AsyncM(async p => {
			for(let x of this.buffer) { 
				await AsyncM.timeout(0).run(p)
			        subscription.emitter.emit(x)
			}
			super._addObserver(subscription)
		})._run(subscription.progress)
	}

	// @Override
	_last () { if(this.refCount) super._last() }
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

const make = f => (...args) => ob => f.apply(ob, args)
const combineAll              = make(Observable.prototype.combineAll)         // combination
const combineLatest           = Observable.combineLatest 
const concat                  = Observable.concat 
const concatAll               = make(Observable.prototype.concatAll)
const endWith                 = make(Observable.prototype.endWith)
const forkJoin                = Observable.forkJoin
const merge                   = Observable.merge 
const mergeAll                = make(Observable.prototype.mergeAll)
const pairwise                = make(Observable.prototype.pairwise)
const race                    = Observable.race
const startWith               = make(Observable.prototype.startWith)
const withLatestFrom          = make(Observable.prototype.withLatestFrom)
const zip                     = Observable.zip
const defaultIfEmpty          = make(Observable.prototype.defaultIfEmpty)     // conditional
const every                   = make(Observable.prototype.every)
const iif 	              = Observable.iif
const ajax                    = Observable.ajax                               // creation
const create                  = Observable.create
const defer                   = Observable.defer
const empty 	              = Observable.empty
const from                    = Observable.from 
const fromEvent               = Observable.fromEvent 
const generate                = Observable.generate
const interval                = Observable.interval 
const of                      = Observable.of 
const range                   = Observable.range
const throwError              = Observable.throwError
const timer                   = Observable.timer
const sequenceEqual           = make(Observable.prototype.sequenceEqual)
const catchError              = make(Observable.prototype.catchError)         // error handling
const retry                   = make(Observable.prototype.retry)
const retryWhen               = make(Observable.prototype.retryWhen)
const share                   = make(Observable.prototype.share)              // multicasting
const shareReplay             = make(Observable.prototype.shareReplay)
const publish                 = make(Observable.prototype.publish)
const multicast               = make(Observable.prototype.multicast)
const audit                   = make(Observable.prototype.audit)              // filtering
const auditTime               = make(Observable.prototype.auditTime)
const debounce                = make(Observable.prototype.debounce)
const debounceTime            = make(Observable.prototype.debounceTime)
const distinct                = make(Observable.prototype.distinct)
const distinctUntilChanged    = make(Observable.prototype.distinctUntilChanged)
const distinctUntilKeyChanged = make(Observable.prototype.distinctUntilKeyChanged)
const filter                  = make(Observable.prototype.filter)
const find                    = make(Observable.prototype.find)
const first                   = make(Observable.prototype.first)
const ignoreElements          = make(Observable.prototype.ignoreElements)
const last 	              = make(Observable.prototype.last)
const sample	              = make(Observable.prototype.sample)
const skip 	              = make(Observable.prototype.skip)
const take                    = make(Observable.prototype.take)
const takeUntil               = make(Observable.prototype.takeUntil)
const throttle                = make(Observable.prototype.throttle)
const throttleTime            = make(Observable.prototype.throttleTime)
const concatMap               = make(Observable.prototype.concatMap)          // transformation
const exhaustMap              = make(Observable.prototype.exhaustMap)
const map                     = make(Observable.prototype.map)
const mapTo                   = make(Observable.prototype.mapTo)
const mergeMap                = make(Observable.prototype.mergeMap)
const pluck                   = make(Observable.prototype.pluck)
const scan                    = make(Observable.prototype.scan)
const switchMap               = make(Observable.prototype.switchMap)
const tap                     = make(Observable.prototype.tap)                // utility 
const delay                   = make(Observable.prototype.delay)
const delayWhen               = make(Observable.prototype.delayWhen)         
const finalize                = make(Observable.prototype.finalize)

ajax.getJSON = ajax 
