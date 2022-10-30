
const oneClickEvent = fromEvent(document, 'click').pipe(
    take(1),
    tap(v => {
      document.getElementById('locationDisplay').innerHTML
        = `Your first click was on location ${v.screenX}:${v.screenY}`;
    })
  )

const subscribe = oneClickEvent.subscribe();

