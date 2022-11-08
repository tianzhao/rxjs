function safe(subscription) {
    if (!(subscription instanceof Subscription || subscription == null))
        throw new TypeError("Not a subscription")

    let seen = new WeakMap()

    let assert = (n, m, sub) => {
        if (n <= m) {
            seen.set(sub, n)
            return n
        }
        throw sub.name
    };

    let rec = (sub, m, checkpoint) => {
        if (!sub) return 0

        if (sub instanceof Array) {
            let n = sub.reduce((acc, s) => acc + rec(s, m, checkpoint))
            return assert(n, m, sub)
        }
        else if (sub instanceof Object) {
            if (seen.has(sub)) return seen.get(sub)

            sub.progress.checkpoint = new WeakRef(checkpoint)

            if (sub.cname.startsWith("fromEvent"))
                return assert(1, m, sub)

            let n
            switch (sub.cname) {
                case "ajax":
                case "create":
                case "defer":
                case "from":
                case "generate":
                case "interval":
                case "of":
                case "range":
                case "throwError":
                case "timer":
                    return assert(1, m, sub)

                case "catchError":
                    rec(sub.source, 1, sub)
                    return 0

                default:
                    n = rec(sub.child, m, checkpoint) + rec(sub.source, m, checkpoint)
                    return assert(n, m, sub)
            }
        }
    };

    let roots
    if (subscription instanceof Subscription)
        roots = [subscription]
    else
        roots = [... Subscription.tracked]

    let result = { roots };

    try {
        result.isSafe = roots.every(s => rec(s, 0, s) == 0)
    } catch(name) {
        result.failedAt = name
        result.isSafe = false
    }

    return result
}
