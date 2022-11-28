
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
 * Scheduler (with timer optimization): 
 * 1. maintain a cache from timer events to event listeners
 * 2. merge listeners to the same timer event
 * 3. flush the cache at appropriate time 
 *   e.g. when an (not just timer) event fires but this only works with one scheduler 
 */

class Scheduler {
	constructor() { this.flush() }

	flush () { 
		this.delayCache = {}; 
		this.repeatCache = {}; 
	}

	timer(n, isRepeating) {
		let c = isRepeating ? this.repeatCache : this.delayCache
		if (c[n] == undefined) {
			c[n] = new Timer(n, isRepeating)
		}
		return AsyncM.lift(k => c[n].addListener(k), k => c[n].removeListener(k))
	}

	delay(n) { this.timer(n, false) }

	repeat(n) { this.timer(n, true) }
}

class Timer {
	constructor(duration, isRepeating) {
		this.duration = duration
		this.isRepeating = isRepeating
		this.listeners = []
		this.id = (isRepeating ?  setInterval : setTimeout)(_ => this._fire(), duration)
	}

	_fire() { this.listeners.forEach(l => l()) }

	// though clearInterval and clearTimeout are the same, we distinguish them anyway
	_cancel() { if (this.isRepeating) clearInterval(this.id); else clearTimeout(this.id) } 

	clear () { this.listeners = [] }

	addListener(l) { this.listeners.push(l) }

	removeListener(l) { 
		this.listeners = this.listeners.filter(f => f !=l) 
		if(this.listeners.length == 0) this._cancel();
	}
}

/*
 *  4. Emitter, MVar, and Channel
 */

class Emitter {
	static size = 5

	constructor() {
		this.events = []; // previous events
		this.listeners = [];   // blocked listeners
	}

	// emit an event to this emitter and wait up any pending listeners
	emit (x) {
		const evts = this.events
		evts.push(x)

		if (evts.length > Emitter.size) evts.shift()

		this.listeners.forEach(l => l(x)) 
	}

	next(x) { this.emit(new Next(x)) }
	complete() { this.emit(End) }
	error(x) { this.emit(new ErrorEvent(x)) }

	// listen for the next event as an AsyncM
	listen (k) { this.listeners.push(k) } 
}

class MVar {
	constructor() {
		this.value = undefined;
		this.isEmpty = true;
		this.readers = []; // pending readers
		this.pending = []; // pending putters or takers 
	}

	// a -> AsyncM ()
	put = x => new AsyncM(p => new Promise((k, r) => {
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
	take = new AsyncM(p => new Promise((k, r) => { 
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
	read = new AsyncM(p => new Promise((k, r) => { 
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

	read = new AsyncM(async p => {
		let ret

		if (this.isEmpty()) {
			ret = await this.m.take.run(p)
		}
		else {
			ret = this.data.shift();
			
			if (!this.m.isEmpty) { // has pending data or writers
				let x = await this.m.take.run(p)
				this.data.push(x)
			}
			else {
				this.n = this.n - 1;
			}
		}
		return ret;
	})

	write = x => new AsyncM(async p => {
		if (this.isFull() || 
			this.m.pending.length > 0) {  // has pending readers
			await this.m.put(x).run(p)
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
class ErrorEvent {
	constructor (value) { this.value = value; }
	toString () { return 'Error:' + this.value }
}
const End = new Ended() 

Error.stackTraceLimit = Infinity;

// save the structured stack trace
Error.prepareStackTrace = (err, sst) => {
	err.structuredStackTrace = sst;
    return err.stack
};

class RxError {
	constructor (ex, buildLoc, graphTrace) {
		this.ex = ex
		this.rxGraphTrace = graphTrace

		ex.stack; // trigger Error.prepareStackTrace
		if (ex.structuredStackTrace instanceof Array) {
			let e = {}
			Error.captureStackTrace(e, RxError)
			e.stack; // trigger Error.prepareStackTrace
			let nf = e.structuredStackTrace.length
			this.structuredStackTrace = ex.structuredStackTrace.slice(0, -nf)
			let msg = ex.stack.split('\n', 1)[0]
			//let msg = ex.message
			this.stack = RxError.formatStackTrace(msg, this.structuredStackTrace, buildLoc)
		}
	}

	static _getCallerLocation() {
		let e = {}
		Error.captureStackTrace(e, RxError.getCallerLocation)
		e.stack; // trigger Error.prepareStackTrace
		let thisFileName = e.structuredStackTrace[0].getFileName()
		let i = 0
		let c
		do {
			c = e.structuredStackTrace[++i]
		} while (c.getFileName() == thisFileName)
		let fn = c.getFileName()
		let lno = c.getLineNumber()
		let cno = c.getColumnNumber()
		return `${fn}:${lno}:${cno}`
	}

	static formatStackTrace(msg, st, buildLoc) {
		for (let c of st) {
			let funcname = c.getFunctionName()
			let methodname = c.getMethodName()
			let name
			if (funcname == null && methodname == null)
				name = "<anonymous>"
			else if (funcname != null && methodname != null && funcname != methodname)
				name = `${funcname} [as ${methodname}]`
			else
				name = funcname || methodname
			let filename = c.getFileName() || "<anonymous>"
			let loc = `(${filename}:${c.getLineNumber()}:${c.getColumnNumber()})`
			msg += `\n    at ${name} ${loc}`
		}
		msg += '\n    at ' + buildLoc
		return msg
	}

	static captureSubscriptionGraph(source) {
		let seen = new WeakSet()
		let traverse = source => {
			if (source instanceof Array) {
				return [source.map(traverse)]
			}
			else if (source instanceof Object) {
				if (seen.has(source)) return "...";
				seen.add(source)
				if (source.source) {
					return [source.name].concat(traverse(source.source))
				}
				else {
					return [source.name]
				}
			}
		};

		return traverse(source)
	}
}

class Observable {
	// ef :: (Emitter a, Subscription) -> AsyncM ()
	constructor(ef, name) { 
		this.ef = ef 
		this.name = name
		this.cname = name
	}

	// static _next(e, x) { return AsyncM.timeout(0).fmap(_ => e.next(x)) }
	// static _complete(e) { return AsyncM.timeout(0).fmap(_ => e.complete()) }
	// static _error(e, ex) { return AsyncM.timeout(0).fmap(_ => e.error(ex)) }

	/*
	 * Combination operators
	 */
	combineAll () {
		let ef = (e, subscription) => new AsyncM(async p => {
			let lst = []
			let k = x => {
				if (x != End) lst.push(x.value)
				else {
					Observable.combineLatest(...lst)
						._subscribe(s => subscription.child = s, x => e.emit(x), e, p)
				}
			}

			this._subscribe(s => subscription.source = s, x=>k(x), e, p)
		})

		return new Observable(ef, 'combineAll')
	}

	static combineLatest (...lst) {
		let f = (...x) => x

		if(lst[lst.length-1] instanceof Function) {
			f = lst.pop()
		}

		let ef = (e, subscription) => new AsyncM(async p => {
			let value = lst.map(_ => undefined)
			let j = 0
			let n = lst.length

			let flags = lst.map(_=>false)
			let count = lst.length

			let k = (x, i) => {
				if (x == End) {
					j = j + 1; 
					if (j >= n) e.complete()
				}
				else {
					value[i] = x.value

					if (count > 0 && !flags[i]) {
						count --
						flags[i] = true
					}

					if (count <= 0) e.next(f(...value))
				}
			}

			subscription.source = []
			lst.forEach((ob, i) => {
				Observable.fromPromise(ob)._subscribe(s => subscription.source.push(s), x => k(x, i), e, p)
			})
		})
		
		return new Observable(ef, 'combineLatest')
	}

	static concat (...lst) {
		let ef = (e, subscription) => new AsyncM(async p => {
			let index = 0
			subscription.source = []

			let k = x => {
				if (x != End || index > lst.length-1) 
					e.emit(x)

				if (x == End && index <= lst.length-1) // && p.isAlive()) 
					lst[index++]._subscribe(s => subscription.source.push(s), k, e, p)
			}
			lst[index++]._subscribe(s => subscription.source.push(s), k, e, p)
		})

		return new Observable(ef, 'concat')

		// Inefficient version
		// return Observable.of(...lst).concatAll().rename('concat')
	}

	// buffer the observables using a channel
	concatAll () {
		let ef = (e, subscription) => new AsyncM(async p => {
			let ch = new MChannel() // TODO: add a buffer size parameter

			this._subscribe(s => subscription.source = s, x => ch.write(x)._run(p), e, p)

			let x = await ch.read.run(p)	
			let k = y => {
				if (y == End) {	
					ch.read.bind(x => {
						if (x == End) e.complete()
						else x.value._subscribe(s => subscription.child = s, k, e, p)
					})._run(p)
				}
				else e.emit(y)
			}
			if (x == End) e.complete()
			else x.value._subscribe(s => subscription.child = s, k, e, p)
		})
		return new Observable(ef, 'concatAll')
	}

	endWith (...lst) { return Observable.concat(this, Observable.of(...lst).rename('endWith')).rename('endWith') }

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
						e.next(value)
						e.complete()
					}
				}
				else {
					if (keys) { i = keys[i] }

					value[i] = x.value
				}
			}

			subscription.source = []
			lst.forEach((ob,i) => {
				Observable.fromPromise(ob)._subscribe(s => subscription.source.push(s), x=>k(x,i), e, p)
			})
			
		})
		
		return new Observable(ef, 'forkJoin')
	}

	static merge (...lst) {
		let ef = (e, subscription) => new AsyncM(async p => {
			let i = 0
			let n = lst.length

			let k = x => {
				if (x == End) i = i + 1; else e.emit(x)

				if (i >= n) e.complete()
			}

			subscription.source = []
			lst.forEach(ob => ob._subscribe(s => subscription.source.push(s), k, e, p))
		})

		return new Observable(ef, 'merge')
	}

	merge(...lst) { return Observable.merge(this, ...lst) }

	mergeAll (concurrent=Number.MAX_SAFE_INTEGER) {
		let ef = (e, subscription) => new AsyncM(async p => {
			let buffer = []

			let ending = false
			let count = 0

			let k = x => {
				if (x == End) {
					if (count <= 0) e.complete(); else ending = true 
					return
				}

				if (count >= concurrent) buffer.push(x.value) 
				else {
					count = count + 1

					let k1 = y => {
						if (y == End) {
							if (buffer.length > 0) buffer.shift()._subscribe(s => subscription.child = s, k1, e, p)
							else count = count - 1; 
						}
						else e.emit(y)
						if (count <= 0) {
							if (ending) e.complete(); 
						}	
					}
					x.value._subscribe(s => subscription.child = s, k1, e, p)
				}
			}

			this._subscribe(s => subscription.source = s, k, e, p)
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
						e.next([previous, x.value])
					}
					previous = x.value
				}
			}

			this._subscribe(s => subscription.source = s, k, e, p)
		})

		return new Observable(ef, 'pairwise')
	}

	static race (...lst) {
		let ef = (e, subscription) => new AsyncM(async p => {
			let won = false
			subscription.source = []
			let k = (x, i) => {
				if (! won) {
					subscription.source.forEach((sub, j) => {
						if (j != i) sub.unsubscribe()
					})
					won = true
				}
				e.emit(x)
			}

			lst.forEach((ob, i) => { if (! won) ob._subscribe(s => subscription.source.push(s), x => k(x, i), e, p) })
		})

		return new Observable(ef, 'race')
	}

	race (...lst) { return Observable.race(this, ...lst) }

	startWith (...lst) { return Observable.concat(Observable.of(...lst).rename('startWith'), this).rename('startWith') }

	withLatestFrom (...lst) {
		let f

		if (lst.length >= 2 && lst[lst.length-1] instanceof Function) {
			f = lst.pop()	
		}

		let ef = (e, subscription) => new AsyncM(async p => {
			let latest = []
			let flags = lst.map(_=>false)
			let count = lst.length

			let k = x => {
				if (x == End) { // source ends
					e.complete(); 
					subscription.child.map(ob => ob.unsubscribe());
				}
				else if (count <= 0) {
					let v = [x.value, ...latest]
					e.next((f == undefined) ? v : f(...v))
				}
			}

			let k1 = i => y => { 
				if (y != End) { 
					latest[i] = y.value; 

					if (!flags[i] && count > 0) {
						flags[i] = true
						count-- 
					}
				} 
			}

			subscription.child = []
			lst.forEach((ob,i) => ob._subscribe(s => subscription.child.push(s), k1(i), e, p))
			this._subscribe(s => subscription.source = s, k, e, p)
		})
		
		return new Observable(ef, 'withLatestFrom')
	}

	static zip (...lst) {
		let ef = (e, subscription) => new AsyncM(async p => {
			let channels = lst.map(_ => new MChannel())

			subscription.source = []
			lst.forEach(
				(ob, i) => ob._subscribe(s => subscription.source.push(s), x => channels[i].write(x)._run(p), e, p)
			)

			let ended = false
			while (! ended) {
				let f = ch => ch.read.bind(
					x => (x == End) ? AsyncM.throw(x) : AsyncM.pure(x)
				)

				let y = await AsyncM.all(channels.map(f)).catch(e => End).run(p)

				if (y == End) {
					subscription.source.forEach(sub => sub.unsubscribe())
					ended = true
				}
				if (ended) e.complete(); else e.next(y.map(z => z.value)) 
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
						e.next(d) 
						e.complete()
					}
					else e.emit(x)
				}
				else e.emit(x)
			}

			this._subscribe(s => subscription.source = s, k, e, p)
		})
		return new Observable(ef, 'defaultIfEmpty')
	}

	every (predicate, thisArg) {
		let ef = (e, subscription) => new AsyncM(async p => {
			let index = 0
			
			let k = (x, p1) => {
				if (x == End) {
					e.next(true)
					e.complete()
				}
				else {
					if(! predicate.call(thisArg, x.value, index++, this)) {
						p1.cancel()
						e.next(false)
						e.complete()
					}
				}
			}
			this._subscribe(s => subscription.source = s, k, e, p)
		})
		return new Observable(ef, 'every')
	}

	static iif (condition, trueResult = Observable.empty(), falseResult = Observable.empty()) {
		return condition() ? trueResult : falseResult 
	}

	sequenceEqual (compareTo, comparator = (a,b)=>(a==b)) {
		let ef = (e, subscription) => new AsyncM(async p => {
			let lst = [this, compareTo]

			let buffers = lst.map(_ => [])

			let flip = i => (i==0) ? 1 : 0

			let h = i => (x, p) => {
				let j = flip(i)

				if (buffers[j].length == 0) { buffers[i].push(x) }
				else {
					let y = [x, buffers[j].shift()]

					if(y[0] == End && y[1] == End) { 
						e.next(true)
						e.complete()
					}
					else if (y[0] != End && y[1] != End && comparator(y[0].value, y[1].value)) { }
					else {
						p.cancel()

						e.next(false)
						e.complete()
					}
				}
			}

			subscription.source = []
			lst.forEach((ob, i) => ob._subscribe(s => subscription.source.push(s), h(i), e, p))
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
		let ef = (e, subscription) => new AsyncM(async p => {
			let k = {}
			k.next     = x => e.next(x)
			k.complete = _ => e.complete()
			k.error    = x => e.error(x)
			p.addCanceller(subscribe(k))
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
					e.next(y)
					e.complete()
				}
				catch(ex) {
					e.emit(new ErrorEvent(ex))
				}
			}), 'from')
		}
		else if (x instanceof Array) {
			return Observable.of(...x).rename('from')
		}
		else if (x instanceof String || typeof(x) == 'string') {
			return Observable.of(...x.split('')).rename('from')
		}
		else if (x instanceof Map) { // return its key/value pairs
			return Observable.of(...x.entries()).rename('from')
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
					.bind(x => e.next(x.originalEvent))
					.run(p)
			}
		})
		return new Observable(ef, `fromEvent (${elem}, ${evt})`)	
	}

	static generate(init, cond, inc, proj = x=>x) {
		let ef = (e, _) => new AsyncM(async p => {	
			let x = init
			while(cond && cond(x) && p.isAlive()) {
				e.next(proj(x))
				x = inc(x)
			}
			if (p.isAlive()) e.complete()
		})
		return new Observable(ef, 'generate')
	}

	// emit 'n' starting from 'x' for each 'dt' millisecond 
	static interval = (dt, x=0) => {
		let ef = (e, _) => new AsyncM(p => new Promise((_, r) => {
			let n = x

			let timer = setInterval(_ => e.next(n++), dt)
			p.addCanceller(_ => { 
				clearInterval(timer); 
				r('interrupted') 
			}) 
		}))
		return new Observable(ef, `interval(${dt})`)
	}

	static of (...lst) {
		let ef = (e, _) => new AsyncM(async p => {
			for(let i=0; i<lst.length && p.isAlive(); i++) {
				e.next(lst[i])
			}
			if (p.isAlive()) e.complete()
		})
		return new Observable(ef, 'of')
	}

	static range(low, high) {
		return Observable.generate(low, x=> x<=high, x=>x+1).rename(`range(${low}, ${high})`)
	}

	static throwError (ex) { return Observable.of(null).rename('throwError').map(_ => { throw ex }).rename('throwError') }

	static timer(d, dt) {
		let ef = (e, _) => AsyncM.timeout(d)
			.bind(_ => { 
				e.next(0) 
				return dt ? Observable.interval(dt, 1).ef(e, undefined) 
					  : AsyncM.ifAlive.fmap(_=>e.complete())
			})
		return new Observable(ef, `timer (${d}${dt != undefined ? `, ${dt}` : ''})`)		
	}

	/*
	 * Error handling
	 */

	// f :: Error -> Observable a
	catchError (f) {
		let ef = (e, subscription) => new AsyncM(async p => {
			let h = (x, p1) => {
				try {
					p1.cancel()
					// subscribe to the replacement observable, but if 'h' is called synchronously, 
					// the subscription can't be saved so that we just don't save it for now.
					f(x.value)._subscribe(s => subscription.source = s, x => e.emit(x), e, p)
				}
				catch (ex) {
					e.emit(new ErrorEvent(ex))
				}
			}
			this._subscribe(s => subscription.source = s, x => e.emit(x), {emit: h}, p)
		})

		return new Observable(ef, 'catchError') 	
	}

	retry (times) {
		let ef = (e, subscription) => new AsyncM(async p => {
			let n = times
			let h = (x, p1) => {
				if (n > 0) {
					n = n - 1
					p1.cancel()
					this._subscribe(s => subscription.source = s, x => e.emit(x), {emit: h}, p)
				}
				else {
					e.emit(x)
				}
			}
			this._subscribe(subscription.source = s, x => e.emit(x), {emit: h}, p)
		})

		return new Observable(ef, 'retry(' + times + ')') 			
	}


	retryWhen (notifier) {
		let ef = (e, subscription) => new AsyncM(async p => {
			let h = (x, p1) => {
				p1.cancel()
				notifier(Observable.of(x.value))._subscribe(s => subscription.child = s, (y, p2) => {
					if (y == End) e.complete()
					else {
						p2.cancel()
						this._subscribe(s => subscription.source = s, x => e.emit(x), {emit: h}, p)
					}
				}, e, p)
			}
			this._subscribe(s => subscription.source = s, x => e.emit(x), {emit: h}, p)
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
			let latest

			let k = x => {
				if (subscription.child) subscription.child.unsubscribe()

				if (x == End) {
					if (latest) e.emit(latest)
					e.complete()
				}
				else {
					latest = x

					selector(x.value)._subscribe(s => subscription.child = s, (_, p2) => {
						p2.cancel()
						e.emit(latest)
					}, e, p)
				}
			}

			this._subscribe(s => subscription.source = s, k, e, p)
		})
		return new Observable(ef, 'debounce()')
	}

	debounceTime (dt) {
		return this.debounce(_ => timer(dt).rename(`debounceTime(${dt})`)).rename(`debounceTime(${dt})`)
	}

	distinct (keySelector = x => x, flush) {
		let ef = (e, subscription) => new AsyncM(async p => {
			let cache = new Set()

			let k = x => {
				if (x == End) {
					cache.clear() 
					e.complete()
				}
				else {
					let y = keySelector(x.value)

					if (! cache.has(y)) {
						cache.add(y)
						e.emit(x)
					}
				}
			}

			if (flush instanceof Observable) flush._subscribe(s => subscription.child = s, _ => cache.clear(), e, p)

			this._subscribe(s => subscription.source = s, k, e, p)
		})
		return new Observable(ef, 'distinct')		
	}

	distinctUntilChanged (f = (prev, curr) => prev == curr) {
		let ef = (e, subscription) => new AsyncM(async p => {
			let previous;

			let k = x => {
				if (x == End) e.complete()
				else if (!previous || ! f(previous, x.value)) {
					previous = x.value
					e.emit(x)
				}
			}

			this._subscribe(s => subscription.source = s, k, e, p)
		})
		return new Observable(ef, 'distinctUntilChanged')
	}

	distinctUntilKeyChanged (key, compare = (a,b) => a == b) {
		let ef = (e, subscription) => new AsyncM(async p => {
			let previous;

			let k = x => {
				if (x == End) e.commplete()
				else if (previous == undefined || ! compare(x.value[key], previous)) {
					previous = x.value[key]
					e.emit(x)
				}
			}

			this._subscribe(s => subscription.source = s, k, e, p)
		})
		return new Observable(ef, 'distinctUntilKeyChanged')
	}

	filter (predicate, thisArg) {
		let ef = (e, subscription) => new AsyncM(async p => {
			let index = 0
			this._subscribe(s => subscription.source = s, x => {
				try {
					if (x == End) e.complete() 
					else if (predicate.call(thisArg, x.value, index++)) e.emit(x)
				}
				catch (ex) {
					e.emit(new ErrorEvent(ex))
				}
			}, e, p) 
		})
		return new Observable(ef, 'filter') 	
	}

	find (predicate) { return this.filter(predicate).rename('find').take(1).rename('find') }

	first (predicate = _ => true, defaultValue) {
		let ef = (e, subscription) => new AsyncM(async p => {
			let f = (x, p1) => {
				e.next(x)
				e.complete()
				p1.cancel()
			}
			this._subscribe(s => subscription.source = s, (x, p1) => {
				if (x == End) {
					if (defaultValue) f(defaultValue, p1)
					else e.error('No first event');
				}
				else if (predicate(x.value)) f(x.value, p1)
			}, e, p) 
		})
		return new Observable(ef, 'first') 		
	}

	ignoreElements () {
		let ef = (e, subscription) => new AsyncM(async p => {
			this._subscribe(s => subscription.source = s, x => {
				if (x == End) { e.complete() }
			}, e, p) 
		})
		return new Observable(ef, 'ignoreElements') 
	}

	last (predicate = _ => true, defaultValue) {
		let ef = (e, subscription) => new AsyncM(async p => {
			let last

			let f = (x, p1) => {
				p1.cancel()
				e.next(x)
				e.complete()
			}
			this._subscribe(s => subscription.source = s, (x, p1) => {
				if (x == End) {
					if (last) f(last.value, p1) 
					else if (defaultValue) f(defaultValue, p1)
					else e.emit(new ErrorEvent('No last event'));
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
					e.complete(); 
				}
				else if (latest && updated) {
					updated = false
					e.emit(latest)
				}
			}

			let k1 = y => { 
				if (y == End) { // source ends
					subscription.child.unsubscribe()
					e.complete()
				}
				else {
					latest = y 
					updated = true
				}
			}

			this._subscribe(s => subscription.source = s, k1, e, p)
			sampler._subscribe(s => subscription.child = s, k, e, p)
		})
		
		return new Observable(ef, 'sampler')
	}

	single (predicate) { return this.filter(predicate).rename('single').take(1).rename('single'); }

	skip (size) { return this.skipWhile((_, index) => index < size).rename(`skip(${size})`) }

	skipUntil (ob) {
		let ef = (e, subscription) => new AsyncM(async p => {
			let b = true
			let k = x => {
				if (x == End) {
					subscription.child.unsubscribe()
					e.complete()
				}
				else if (!b) { e.emit(x) } 
			}

			this._subscribe(s => subscription.source = s, k, e, p)
			ob._subscribe(s => subscription.child = s, (_, p2) => { 
				b = false
				p2.cancel()
			}, e, p)
		})
		return new Observable(ef, 'skipUntil') 	
	}

	skipWhile (predicate) {
		let ef = (e, subscription) => new AsyncM(async p => {
			let b = true
			let index = 0

			let k = x => {
				if (x == End) e.complete()
				else { 
					if (b) { 
						b = predicate(x.value, index++) 
						if (!b) e.emit(x)
					}
					else e.emit(x) 
				}
			}

			this._subscribe(s => subscription.source = s, k, e, p)
		})
		return new Observable(ef, 'skipWhile') 	
	}

	take (size) { return this.takeWhile((_, index) => index < size-1, true).rename(`take(${size})`) } 	

	takeLast (size) {
		let ef = (e, subscription) => new AsyncM(async p => {
			let buffer = []
			let k = x => {
				if (x == End) { 
					for(let x of buffer) e.next(x)	
					e.complete()
				}
				else {
					buffer.push(x.value)
					if (buffer.length > size) buffer.shift()
				}
			}

			this._subscribe(s => subscription.source = s, k, e, p)
		})
		return new Observable(ef, `takeLast({size})`) 	
	}


	takeUntil (ob) {
		let ef = (e, subscription) => new AsyncM(async p => {
			ob._subscribe(s => subscription.child = s, (_, p2) => {
				p2.cancel()
				subscription.source.unsubscribe()
				e.complete()
			}, e, p)
			this._subscribe(s => subscription.source = s, x => {
				if (x == End) subscription.child.unsubscribe() 
				e.emit(x)
			}, e, p)
		})
		return new Observable(ef, 'takeUntil') 	
	}

	takeWhile (predicate, inclusive) {
		let ef = (e, subscription) => new AsyncM(async p => {
			let b = true
			let index = 0

			let k = (x, p1) => {
				if (x == End) e.complete()
				else {
					if (b) { 
						b = predicate(x.value, index++) 
						if (b || inclusive) e.emit(x)
						if (!b) {
							p1.cancel()
							e.complete()
						}
					}
				}
			}

			this._subscribe(s => subscription.source = s, k, e, p)
		})
		return new Observable(ef, 'takeWhile') 	
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

			let k = x => {
				if (x == End) {
					if (subscription.child) subscription.child.unsubscribe()
					if (trailing && trailingEvent) e.emit(trailingEvent) 
					e.complete()
				}
				else {
					if (auditing) auditingEvent = x

					if (! masked) {
						masked = true
						if (trailing) trailingEvent = undefined

						let ob = Observable.fromPromise(selector(x.value))

						ob._subscribe(s => subscription.child = s, (_, p2) => {
							p2.cancel()
							masked = false
							if (trailing && trailingEvent) e.emit(trailingEvent)
							if (auditing && auditingEvent) e.emit(auditingEvent)
						}, e, p)

						if (leading) e.emit(x)
					}
					else if (trailing) trailingEvent = x 
				}
			}

			this._subscribe(s => subscription.source = s, k, e, p)
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

	buffer (ob) {
		let ef = (e, subscription) => new AsyncM(async p => {
			let cache = []

			this._subscribe(s => subscription.source = s, x => {
				if (x == End) {
					subscription.child.unsubscribe()
					e.complete()
				}
				else { cache.push(x.value) }
			}, e, p)

			ob._subscribe(s => subscription.child = s, _ => { 
				e.next(cache)
				cache = []
			}, e, p)
		})
		
		return new Observable(ef, 'buffer') 
	}

	bufferCount (size, every) {
		let ef = (e, subscription) => new AsyncM(async p => {
			let cache = []
			let count = 0
			let filled = false

			if (every == undefined) every = size

			this._subscribe(s => subscription.source = s, x => {
				if (x == End) {
					e.complete()
				}
				else { 
					cache.push(x.value) 
					if (cache.length > size) { cache.shift() }

					if (! filled) {
						if (cache.length >= size) {
							filled = true
							e.next(cache)
						}
					}
					else {
						count = count + 1
						if (count >= every) {
							count = 0
							e.next(cache)
						}
					}
				}
			}, e, p)
		})
		
		return new Observable(ef, `bufferCount(${size}, ${every})`) 
	}

	bufferTime (size, every) {
		if(every != undefined) {
			return this.bufferToggle(
				Observable.interval(every).startWith(-1), 
				_ => Observable.timer(size)
			).rename(`bufferTime(${size}, ${every})`) 
		}

		let ef = (e, subscription) => new AsyncM(async p => {
			let buffer = []

			Observable.interval(size)._subscribe(s => subscription.child = s, x => {
				e.next(buffer)
				buffer = []
			}, e, p)

			this._subscribe(s => subscription.source = s, x => {
				if (x == End) {
					subscription.child.unsubscribe()
					e.complete()
				}
				else buffer.push(x.value)
			}, e, p)
		})
		
		return new Observable(ef, `bufferTime(${size})`) 
	}

	bufferToggle (ob, f) {
		let toArray = lst => {
			let ret = []
			while (lst.next != undefined) {
				ret.push(lst.data)
				lst = lst.next
			}
			return ret
		}
		let ef = (e, subscription) => new AsyncM(async p => {
			let cache = {}

			let k = v => {
				let start = cache
				let sub = f(v)._subscribe(null, (_, p2) => { 
					e.next(toArray(start))
					p2.cancel()
				}, e, p)
			}

			ob._subscribe(s => subscription.child = s, x => {
				if (x != End) k(x.value)
			}, e, p)

			this._subscribe(s => subscription.source = s, x => {
				if (x == End) {
					subscription.child.unsubscribe()
					e.complete()
				}
				else { 
					cache.data = x.value
					cache.next = {}
					cache = cache.next
				}
			}, e, p)
		})
		
		return new Observable(ef, 'bufferToggle') 
	}

	bufferWhen (f) {
		let ef = (e, subscription) => new AsyncM(async p => {
			let cache = []

			let h = _ => {
				f()._subscribe(s => subscription.child = s, (_, p2) => { 
					p2.cancel()
					e.next(cache)
					cache = []
					h()
				}, e, p)
			}
			h()

			this._subscribe(s => subscription.source = s, x => {
				if (x == End) {
					subscription.child.unsubscribe()
					e.complete()
				}
				else { cache.push(x.value) }
			}, e, p)
		})
		
		return new Observable(ef, 'bufferWhen') 
	}

	concatMap (f) { return this.fmap(f).rename('concatMap').concatAll().rename('concatMap') } 

	concatMapTo (ob, f) { return this.concatMap(x=> ob.fmap(y=> f(x,y)).rename('concatMapTo')).rename('concatMapTo') } 

	count () {
		let ef = (e, subscription) => new AsyncM(async p => {
			let c = 0 
			this._subscribe(s => subscription.source = s, x => {
				if (x == End) {
					e.next(c)
					e.complete()
				}
				else c++
			}, e, p)
		})
		return new Observable(ef, 'count') 	
	}


	exhaustMap (f) {
		let ef = (e, subscription) => new AsyncM(async p => {
			let ready = true
			let ending = false

			this._subscribe(s => subscription.source = s, x => {
				if (x == End) {
					if (ready) e.complete()
					else ending = true
				}
				else if (ready) {
					ready = false

					f(x.value)._subscribe(s => subscription.child = s, y => {
						if (y == End) {
							if (ending) e.complete()
							else ready = true 
						}
						else e.emit(y)
					}, e, p)
				}
			}, e, p)
		})
		
		return new Observable(ef, 'exhaustMap') 	
	}

	expand (f, concurrent=Number.MAX_SAFE_INTEGER) {
		let ef = (e, subscription) => new AsyncM(async p => {
			
			// subscription.source = []
			let count = 1
			let buffer = []
			
			let h = ob => ob._subscribe(s => subscription.source = s, (x, p1) => {
				if (x == End) {
					if (buffer.length > 0) {
						if (p1.isAlive()) h(buffer.shift())
					}
					else count -- 
				}
				else {
					e.emit(x)

					let nextOb = f(x.value)

					if (count >= concurrent) {
						buffer.push(nextOb)
					}
					else {
						count ++
						if (p1.isAlive()) h(nextOb)
					}
				}
				if (count <= 0) e.complete()
			}, e, p)

			h(this)
		})

		return new Observable(ef, 'expand')
	}

	groupBy (keyF, selectF = x=>x) {
		let ef = (e, subscription) => new AsyncM(async p => {
			let map = {}
			let subject = new Subject(this)
			
			subject._subscribe(s => subscription.source = s, x => {
				if (x == End) {
					e.complete()
				}
				else {
					let key = keyF(x.value)
					
					if (map[key] == undefined) {
						let ob = new Observable((e1, _) => new AsyncM(async p1 => {
							// 'x.value' is also passed to 'ob' 
							// 	since it is added before the firing completes 
							// do we need to perform cleanup?
							subject._subscribe(s => subscription.child = s, y => {
								if (y == End) e1.complete()
								else if (keyF(y.value) == key) {
									e1.next(selectF(y.value))
								}
							}, e, p1) // don't handle error for each group
						}), 'group')

						map[key] = key // only need to know which keys exist
						ob.key = key
						e.next(ob)
					}
				}
			}, e, p)

			subject.connect()
		})

		return new Observable(ef, 'groupBy')
	}

	map (f) { return this.fmap(f).rename('map') }

	fmap (f) {
		let loc = RxError._getCallerLocation()

		if (typeof f != 'function')
			throw new TypeError(f + " is not a function", loc)

		let ef = (e, subscription) => new AsyncM(async p => {
			let i = 0
			this._subscribe(s => subscription.source = s, x => {
				try {
					(x == End) ? e.complete() : e.next(f(x.value, i++))
				}
				catch (ex) {
					let graphTrace = RxError.captureSubscriptionGraph(subscription)
					ex = new RxError(ex, loc, graphTrace)
					e.error(ex)
				}
			}, e, p) 
		})
		return new Observable(ef, 'fmap') 	
	}

	mapTo (x) { return this.fmap(_ => x).rename('mapTo') }

	mergeMap (f, selector, concurrent) {
		if (selector == undefined)
			return this.fmap(f).rename('mergeMap').mergeAll().rename('mergeMap') 
		else 
			return this.fmap((x, i) => Observable.fromPromise(f(x)).fmap((y, j)=> [x, y, i, j]).rename('mergeMap')).rename('mergeMap')
				.mergeAll(concurrent).rename('mergeMap')
				.fmap(lst => selector(...lst)).rename('mergeMap')
	}

	static fromPromise (ob) { return (ob instanceof Promise) ? Observable.from(ob) : ob }

	mergeScan (accumulator, seed, concurrent) {
		return Observable.fix(
			ob => {
				let index = 0
				return this.withLatestFrom(ob.startWith(seed)).rename('mergeScan')
				  .fmap(([e, c]) => accumulator(c, e, index++)).rename('mergeScan')
				  .mergeAll(concurrent).rename('mergeScan')
			}
		).rename('mergeScan'); 
	}

	// Return a recursively defined Observable
	// f :: Observable a -> Observable a
	static fix (f) {
		let ef = (e, subscription) => {
			let subject = new Subject()
			subject.observable = f(subject)
			subject.connect()
		
			return subject.ef(e, subscription)
		}
		return new Observable(ef, 'fix')
	}

	static partition (ob, predicate, thisArg) {
		return [ob.filter(predicate, thisArg), ob.filter((v, i) => !predicate.call(thisArg, v, i))]
	}

	pluck (...lst) {
		return this.fmap(x => lst.reduce((c, e) => 
			(c!=undefined && c[e]!=undefined) ? c[e] : undefined, x)).rename('pluck') 
	}

	reduce (accumulator, seed) { return this.scan(accumulator, seed).rename('reduce').last().rename('reduce') } 

	// accumulator :: (c, e) -> c
	// seed :: c
	scan (accumulator, seed) {
		let ef = (e, subscription) => new AsyncM(async p => {
			let c = seed
			this._subscribe(
				s => subscription.source = s,
				x => {
					if (x == End) e.complete()
					else { 
						try {
							if (c == undefined) c = x.value
							else c = accumulator(c, x.value)
							
							e.next(c)
						} 
						catch (ex) {
							e.error(ex)
						}
					}
				},
				{emit: x => e.emit(x)},
				p
			)
		})
		return new Observable(ef, 'scan') 			
	}

	switchMap (f, selector) {
		if (selector == undefined) 
			return this.fmap(f).rename('switchMap').join().rename('switchMap')
		else
			return this.fmap((x,i) => f(x).fmap((y,j) => selector(x,y,i,j)).rename('switchMap')).rename('switchMap').join().rename('switchMap')
	}

	switchAll () { return this.join().rename('switchAll') }

	join () {
		let loc = RxError._getCallerLocation()

		let ef = (e, subscription) => new AsyncM(async p => {
			let ending = true

			this._subscribe(s => subscription.source = s, x => {
				if (x == End) {
					if (ending) e.complete(); else ending = true
				}
				else {
					ending = false
					if (subscription.child) subscription.child.unsubscribe()
					try {
						if (!x.value || !x.value._subscribe)
							throw new TypeError(x.value + " is not subscribable.")
						x.value._subscribe(s => subscription.child = s, y => {
							if (y == End) {
								if (ending) e.complete()
								else ending = true
							}
							else e.emit(y)
						}, e, p)
					}
					catch (ex) {
						let graphTrace = RxError.captureSubscriptionGraph(subscription)
						ex = new RxError(ex, loc, graphTrace)
						e.error(ex)
					}
				}
			}, e, p)
		})

		return new Observable(ef, 'join') 	
	}

	switchMapTo (ob) { return this.switchMap(_ => ob).rename('switchMapTo') }

	toArray () {
		let ef = (e, subscription) => new AsyncM(async p => {
			let array = []
			this._subscribe(s => subscription.source = s, x => {
				if (x == End) {
					e.next(array)
					e.complete()
				}
				else array.push(x.value)
			}, e, p)
		})
		return new Observable(ef, 'toArray') 	
	}

	window (ob) {
		let ef = (e, subscription) => new AsyncM(async p => {
			let subject;
			
			let h = _ => {
				if (subject) subject.complete()
				subject = new Subject()
				e.next(subject)
			}

			h()

			this._subscribe(s => subscription.source = s, x => {
				if (x == End) {
					subject.complete()
					e.complete()
				}
				else {
					subject.next(x.value)
				}
			}, e, p)

			ob._subscribe(s => subscription.child = s, h, e, p)
		})
		return new Observable(ef, 'window') 	
	}

	windowCount (size, every=size) {
		let ef = (e, subscription) => new AsyncM(async p => {
			if (size <= 0 || every <= 0) throw "illegal window size or stride"  // TODO: better default?

			let addCount = 0
			let delCount = 0
			let windows = []
			
			let h = _ => {
				let subject = new Subject()
				e.next(subject)
				windows.push(subject)
			}

			h()

			this._subscribe(s => subscription.source = s, x => {
				if (x == End) {
					windows.forEach(subject => subject.complete())
					e.complete()
				}
				else {
					windows.forEach(subject => subject.next(x.value))
					addCount = addCount + 1
					delCount = delCount + 1

					if ((delCount-size) == 0 || (delCount-size) == every) {
						windows.shift().complete()
						delCount = size
					}
					if (addCount == every) {
						addCount = 0
						h()
					}
				}
			}, e, p)
		})
		return new Observable(ef, `windowCount(${size}, ${every})`) 	
	}

	windowTime (size, every) {
		if (every != undefined) {
			return this.windowToggle(
				Observable.interval(every).startWith(-1), 
				_ => Observable.timer(size)
			).rename(`windowTime(${size}, ${every})`) 
		}
		
		let ef = (e, subscription) => new AsyncM(async p => {
			let subject = new Subject()
			e.next(subject)
			
			Observable.interval(size)._subscribe(s => subscription.child = s, x => {
				subject.complete()
				subject = new Subject()
				e.next(subject)
			}, e, p)

			this._subscribe(s => subscription.source = s, x => {
				if (x == End) {
					subject.complete()
					e.complete()
				}
				else subject.next(x.value)
			}, e, p)
		})

		return new Observable(ef, `windowTime(${size})`) 	
	}

	windowToggle (ob, f) {
		let ef = (e, subscription) => new AsyncM(async p => {
			let windows = []
			
			ob._subscribe(s => subscription.child = s, x => {
				if (x == End) {
					subscription.source.unsubscribe()
					e.complete()
				}
				else {
					let subject = new Subject()
					windows.push(subject)
					e.next(subject)

					// TODO
					f(x.value)._subscribe(null, (_, p3) => {
						p3.cancel()
						subject.complete()
						windows = windows.filter(s => s != subject)
					}, e, p)
				}
			}, e, p)

			this._subscribe(s => subscription.source = s, x => {
				if (x == End) {
					windows.forEach(subject => subject.complete())
					e.complete()
				}
				else windows.forEach(subject => subject.next(x.value))
			}, e, p)
		})
		return new Observable(ef, 'windowToggle') 	
	}

	windowWhen (f) {
		let ef = (e, subscription) => new AsyncM(async p => {
			let subject;

			let h = _ => {
				subject = new Subject()
				e.next(subject)

				f()._subscribe(s => subscription.child = s, (_, p2) => { 
					p2.cancel()
					subject.complete()
					h()
				}, e, p)
			}
			h()
			
			this._subscribe(s => subscription.source = s, x => {
				if (x == End) {
					subscription.child.unsubscribe()
					e.complete()
				}
				else { 
					if (subject) subject.next(x.value) 
				}
			}, e, p)
		})
		
		return new Observable(ef, 'windowWhen') 
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
			this._subscribe(s => subscription.source = s, x => {
				try {
					if (x == End) {
						if (complete) complete(End);
						e.complete(); 
					}
					else { 
						f(x.value); 
						e.next(x.value) 
					}
				}
				catch (ex) {
					e.emit(new ErrorEvent(ex))
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
			this._subscribe(s => subscription.source = s, x => {
				AsyncM.timeout(dt).fmap(_ => e.emit(x))._run(p)
			}, e, p)
		})
		return new Observable(ef, 'delay') 	
	}

	delayWhen (selector) {
		let ef = (e, subscription) => new AsyncM(async p => {
			let ending = false
			this._subscribe(s => subscription.source = s, (x, p1) => {
				if (x == End) {
					if (subscription.child) ending = true; else e.complete()
				}
				else {
					selector(x.value)._subscribe(s => subscription.child = s, (y, p2) => {
						if (y == End) {
							p1.cancel()
							e.complete()
						}
						else {
							p2.cancel()
							e.emit(x)
							if (ending) e.complete()
						}
					}, e, p)
				}
			}, e, p)
		})
		return new Observable(ef, 'delayWhen') 			
	}

	finalize (h) {
		let ef = (e, subscription) => new AsyncM(async p => {
			this._subscribe(s => subscription.source = s, x => e.emit(x), e, p, h)
		})
		return new Observable(ef, 'finalize') 					
	}

	repeat (n) {
		let ef = (e, subscription) => new AsyncM(async p => {
			let count = 1

			let h = _ => {
				this._subscribe(s => subscription.source = s, x => {
					if (x == End) {
						if (n == undefined || count++ < n) {
							h()	
						}
						else e.complete()
					}
					else e.emit(x)
				}, e, p)
			}
			h()
		})

		return new Observable(ef, `repeat(${n})`)
	}

	repeatWhen (notifier) {
		let ef = (e, subscription) => new AsyncM(async p => {
			let h = _ => {
				this._subscribe(s => subscription.source = s, x => {
					if (x == End) {
						notifier(Observable.of(x))._subscribe(s => subscription.child = s, (y, p2) => {
							if (y == End) {
								e.complete()
							}
							else {
								p2.cancel()
								h()
							}
						}, e, p)					
					}
					else e.emit(x)
				}, e, p)
			}
			h()
		})

		return new Observable(ef, 'repeatWhen()')
	}

	timeInterval () {
		function TimeInterval(value, interval) {
			this.value = value
			this.interval = interval
		}
		let ef = (e, subscription) => new AsyncM(async p => {
			let prev = new Date().getTime()
			this._subscribe(s => subscription.source = s, x => {
				if (x == End) e.complete()
				else {
					let now = new Date().getTime()
					e.next(new TimeInterval(x.value, now-prev))
					prev = now
				}
			}, e, p)
		})
		return new Observable(ef, 'timeInterval') 		
	}


	timeout (due) {
		let first = -1
		let each  = -1
		let f

		// too lazy to consider the case where 'due' is a Date object
		if(typeof(due) == 'number') {
			first = due
			each = due	
		}
		else {
			if(due.each != undefined) each = due.each
			if(due.first != undefined) first = due.first
			if(due.with != undefined) f = due.with
		}

		let message = 'Error: Timeout has occurred'

		let ef = (e, subscription) => new AsyncM(async p => {
			let h = (n, p) => AsyncM.timeout(n).fmap(_ => e.emit(new ErrorEvent(message)))._run(p)
			let p1 = new Progress(p)

			this._subscribe(s => subscription.source = s, x => {
				p1.cancel()
				e.emit(x)
				if (each > 0 && x != End) {
					p1 = new Progress(p)
					h(each, p1)
				}
			}, e, p)

			if (first > 0) h(first, p1)
		})

		let ob = new Observable(ef, 'timeOut') 	

		if(f) ob = ob.catchError(ex => (ex == message) ? f() : Observable.throwError(message))

		return ob
	}

	timeoutWith(due, ob) { return this.timeout({first: due, each: due, with: _=>ob}).rename('timeoutWith') }

	// lst :: [Instance Method of Observable]
	pipe (...lst) { return lst.reduce((ob, f) => f(ob), this) }

	rename (name) { this.name = name; return this }

	subscribe (k=x=>x, error=console.error, complete) {
		let next = x=>x

		if (typeof(k) == 'function') next = k 
		else if (typeof(k) == 'object') {
			if(k.next) next = k.next
			if(k.complete) complete = k.complete
			if(k.error) error = k.error
		}
		let p = new Progress()
		let e = {emit: x => {
			p.cancel()
			error(x.value)
		}}
		return this._subscribe(null, x => { 
			if (x == End) {
				if (complete) complete()
			}
			else next(x.value)
		}, e, p)
		.track(true)
	}

	// (Emitter a, a -> (), Error -> (), _ -> ()) -> ()
	_listen (e1, k, h, c) {
		let f = x => {
			if (x instanceof ErrorEvent) 
				h(x) 
			else {
				if (x instanceof Next) { 
					x.value = Observable.fromPromise(x.value)
				}
				k(x)
				
				if (x == End) c()
			}
		}
		e1.listen(f)
	}

	// k: a => (), e :: Emitter a, f :: Progress, f :: finalizer
	_subscribe(sf, k, e, p, f) {
		let e1 = new Emitter()
		let p1 = p.cons()
		let s = new Subscription(this.name, this.cname, e1, p1)

		// run f1 if p1 is cancelled or End event is received on e1.
		let f1 = _ => { if (f) f(); p1.unlink() }
		p1.addCanceller(f1)

		// pass 'p1' so that handler can use it to cancel the subscription
		this._listen(e1, x => k(x, p1, s), x => e.emit(x, p1), f1) 
		if (sf) sf(s)

		this.ef(e1, s)._run(p1)

		let r = p.checkpoint && p.checkpoint.deref()
		if (r) {
			let result = safe(r)
			console.log(`safe (${r.name} ~> ${this.name}) =`, result)
		}

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
	error(x) { this._fire(new ErrorEvent(x)) }

	connect() {
		if (! this.connected) {
			this.connected = true
			this.observable._subscribe(
				s => this.source = s,
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

class BehaviorSubject extends Subject {
	constructor(value) {
		super()
		this.value = value
	}

	_addObserver(subscription) {
		super._addObserver(subscription)
		subscription.emitter.next(this.value)
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
		new AsyncM(async p => {
			for(let x of this.buffer) { 
			        if (p.isAlive()) subscription.emitter.emit(x); else break
			}
			super._addObserver(subscription)
		})._run(subscription.progress)
	}

	// @Override
	_last () { if(this.refCount) super._last() }
}
 

class Subscription {
	static tracked = new Set()

	constructor(name, cname, emitter, progress, source=null, child=null) {
		this.name = name
		this.cname = cname
		this.emitter = emitter 
		this.progress = progress
		this.source = source 
		this.child = child
	}

	unsubscribe() { this.track(false); this.progress.cancel() }

	toString() {
		let lst = [this.name]
		if (this.emitter) lst.push(this.emitter.events.toString())
		if (this.source) lst.push(this.source.toString())
		if (this.child) lst.push(this.child.toString())
		return '['+lst.join(',')+']'
	}

	track(add) {
		if (add) Subscription.tracked.add(this)
		else Subscription.tracked.delete(this)
		return this
	}
}


const make = f => (...args) => ob => f.apply(ob, args)
const combineAll              = make(Observable.prototype.combineAll)         // combination
const combineLatest           = Observable.combineLatest 
const concat                  = Observable.concat 
const concatAll               = make(Observable.prototype.concatAll)
const endWith                 = make(Observable.prototype.endWith)
const forkJoin                = Observable.forkJoin
const _merge                  = make(Observable.prototype.merge)
const merge                   = Observable.merge 
const mergeAll                = make(Observable.prototype.mergeAll)
const pairwise                = make(Observable.prototype.pairwise)
const race                    = Observable.race
const raceWith                = make(Observable.prototype.race)
const startWith               = make(Observable.prototype.startWith)
const withLatestFrom          = make(Observable.prototype.withLatestFrom)
const zip                     = Observable.zip
const defaultIfEmpty          = make(Observable.prototype.defaultIfEmpty)     // conditional
const every                   = make(Observable.prototype.every)
const iif                     = Observable.iif
const ajax                    = Observable.ajax                               // creation
const create                  = Observable.create
const defer                   = Observable.defer
const empty                   = Observable.empty
const EMPTY                   = Observable.empty()
const from                    = Observable.from 
const fromEvent               = Observable.fromEvent 
const generate                = Observable.generate
const interval                = Observable.interval 
const NEVER                   = new Observable(_ => AsyncM.never, 'never')
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
const last                    = make(Observable.prototype.last)
const sample                  = make(Observable.prototype.sample)
const single                  = make(Observable.prototype.single)
const skip                    = make(Observable.prototype.skip)
const skipUntil               = make(Observable.prototype.skipUntil)
const skipWhile               = make(Observable.prototype.skipWhile)
const take                    = make(Observable.prototype.take)
const takeLast                = make(Observable.prototype.takeLast)
const takeUntil               = make(Observable.prototype.takeUntil)
const takeWhile               = make(Observable.prototype.takeWhile)
const throttle                = make(Observable.prototype.throttle)
const throttleTime            = make(Observable.prototype.throttleTime)
const buffer                  = make(Observable.prototype.buffer)             // transformation
const bufferCount             = make(Observable.prototype.bufferCount)          
const bufferTime              = make(Observable.prototype.bufferTime)          
const bufferToggle            = make(Observable.prototype.bufferToggle)          
const bufferWhen              = make(Observable.prototype.bufferWhen)          
const concatMap               = make(Observable.prototype.concatMap)          
const concatMapTo             = make(Observable.prototype.concatMapTo)          
const count                   = make(Observable.prototype.count)
const exhaustMap              = make(Observable.prototype.exhaustMap)
const expand                  = make(Observable.prototype.expand)
const groupBy                 = make(Observable.prototype.groupBy)
const map                     = make(Observable.prototype.map)
const mapTo                   = make(Observable.prototype.mapTo)
const mergeMap                = make(Observable.prototype.mergeMap)
const mergeScan               = make(Observable.prototype.mergeScan)
const partition               = Observable.partition
const pluck                   = make(Observable.prototype.pluck)
const reduce                  = make(Observable.prototype.reduce)
const scan                    = make(Observable.prototype.scan)
const switchAll               = make(Observable.prototype.switchAll)
const switchMap               = make(Observable.prototype.switchMap)
const switchMapTo             = make(Observable.prototype.switchMapTo)
const toArray                 = make(Observable.prototype.toArray)
const _window                 = make(Observable.prototype.window)
const windowCount             = make(Observable.prototype.windowCount)
const windowTime              = make(Observable.prototype.windowTime)
const windowToggle            = make(Observable.prototype.windowToggle)
const windowWhen              = make(Observable.prototype.windowWhen)
const tap                     = make(Observable.prototype.tap)                // utility 
const delay                   = make(Observable.prototype.delay)
const delayWhen               = make(Observable.prototype.delayWhen)         
const finalize                = make(Observable.prototype.finalize)
const repeat                  = make(Observable.prototype.repeat)         
const repeatWhen              = make(Observable.prototype.repeatWhen)         
const timeInterval            = make(Observable.prototype.timeInterval)         
const timeout                 = make(Observable.prototype.timeout)         
const timeoutWith             = make(Observable.prototype.timeoutWith)         
const pipe                    = make(Observable.prototype.pipe)         
const noop                    = _ => undefined
ajax.getJSON = ajax 

