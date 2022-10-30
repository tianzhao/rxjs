// elems
const userMessage = document.getElementById('message');
// helper
const delayedMessage = (message, delayedTime = 1000) => {
  return empty().pipe(startWith(message), delay(delayedTime));
};

concat(
  delayedMessage('Get Ready!'),
  delayedMessage(3),
  delayedMessage(2),
  delayedMessage(1),
  delayedMessage('Go!'),
  delayedMessage('', 2000)
).subscribe((message) => (userMessage.innerHTML = message));
