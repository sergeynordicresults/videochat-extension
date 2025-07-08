// import debounce from "debounce-async/src/index.js";
function debounce(
  func,
  wait = 0,
  {
    leading = false,
    cancelObj = 'canceled'
  } = {}
) {
  let timerId, latestResolve, shouldCancel

  function debounced(...args) {
    if (!latestResolve) { // The first call since last invocation.
      return new Promise((resolve, reject) => {
        latestResolve = resolve
        if (leading) {
          invokeAtLeading.apply(this, [args, resolve, reject]);
        } else {
          timerId = setTimeout(invokeAtTrailing.bind(this, args, resolve, reject), wait);
        }
      });
    }

    shouldCancel = true;
    return new Promise((resolve, reject) => {
      latestResolve = resolve;
      timerId = setTimeout(invokeAtTrailing.bind(this, args, resolve, reject), wait);
    });
  }

  function invokeAtLeading(args, resolve, reject) {
    func.apply(this, args).then(resolve).catch(reject);
    shouldCancel = false;
  }

  function invokeAtTrailing(args, resolve, reject) {
    if (shouldCancel && resolve !== latestResolve) {
      reject(cancelObj);
    } else {
      func.apply(this, args).then(resolve).catch(reject);
      shouldCancel = false;
      clearTimeout(timerId);
      timerId = latestResolve = null;
    }
  }

  debounced.stop = function () {
    if (timerId) {
      clearTimeout(timerId);
      timerId = null;
      if (latestResolve) {
        latestResolve(Promise.reject(cancelObj));
        latestResolve = null;
      }
    }
  };

  return debounced;
}

export default debounce;
