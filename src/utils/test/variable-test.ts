const listener = (event: MessageEvent) => {
  console.log(event);
};

function test() {
  // alot going on here
}

test();

function test2() {
  // more going on here
}

test2();

addEventListener("message", listener);
