/**
 * @module AsnycAPIWrapper
 * @description This module provides an Async/Await Wrapper API for the following tasks:
 *                - Event-based messaging between the main thread and a Web Worker instance.
 *                - Triggering and waiting for sispatched CSS transition events.
 * @exports dispatchWorker
 */

const workerMessageScheme = Object.freeze({
  request: { type: "", parameter: [] },
  response: { error: false, message: null },
});

const defaultTimeout = 5000;

function messageSchemeComparator(object) {
  const keys1 = Object.keys(workerMessageScheme).sort();
  const keys2 = Object.keys(object).sort();
  if (keys1.length !== keys2.length) {
    return false;
  }
  keys1.forEach((key, index) => {
    if (key !== keys2[index] || !workerMessageScheme[key] || !object[key]) {
      return false;
    }
  });
  if (
    Object.prototype.toString.call(object.request.type) !==
      Object.prototype.toString.call(workerMessageScheme.request.type) ||
    Object.prototype.toString.call(object.request.parameter) !==
      Object.prototype.toString.call(workerMessageScheme.request.parameter) ||
    Object.prototype.toString.call(object.response.error) !==
      Object.prototype.toString.call(workerMessageScheme.response.error)
  ) {
    return false;
  }
  return true;
}

function handleResponse(respMsg) {
  if (!messageSchemeComparator(respMsg)) {
    throw new Error("Uncaught error from db worker: " + respMsg.toString());
  }
  if (respMsg.response.error === true) {
    throw new Error("Caught error from db worker: " + respMsg.response.message);
  }
}

async function dispatchWorker(worker, message, timeout = defaultTimeout) {
  const workerPromise = new Promise((resolve, reject) => {
    try {
      const messageEventHandler = function (event) {
        worker.removeEventListener(event.type, messageEventHandler);
        const respMsg = event.data;
        if (messageSchemeComparator(respMsg) === false) {
          reject(
            new Error(
              "invalid response message format for worker: " +
                respMsg.toString()
            )
          );
        }
        resolve(respMsg);
      };
      const errorEventHandler = function (event) {
        worker.removeEventListener(event.type, errorEventHandler);
        reject(new Error("Uncaught error for worker: " + event.toString()));
      };
      worker.addEventListener("message", messageEventHandler);
      worker.addEventListener("error", errorEventHandler);
      if (messageSchemeComparator(message) === false) {
        throw new Error(
          "invalid request message format for worker: " + message.toString()
        );
      }
      worker.postMessage(message);
    } catch (error) {
      reject(
        new Error("Caught exception in dispatchWorker: " + error.toString())
      );
    }
  });

  const timeoutPromise = new Promise((resolve, _) => {
    setTimeout(() => {
      const timeoutMessage = structuredClone(workerMessageScheme);
      timeoutMessage.response.error = true;
      timeoutMessage.response.message = "timeout";
      resolve(timeoutMessage);
    }, timeout);
  });

  return Promise.race([workerPromise, timeoutPromise]);
}

async function cssTransitionEnded(
  domElement,
  cssClass,
  timeout = defaultTimeout
) {
  const cssTransitionPromise = new Promise((resolve, reject) => {
    try {
      const transitionEndEventHandler = function (event) {
        domElement.removeEventListener(event.type, transitionEndEventHandler);
        if (event.propertyName === "background-color") {
          resolve("css transition ended: " + event.toString());
        } else {
          reject(
            new Error(
              "CSS transition of an unexpected property - " + event.toString()
            )
          );
        }
      };
      const transitionCancelEventHandler = function (event) {
        domElement.removeEventListener(
          event.type,
          transitionCancelEventHandler
        );
        if (event.propertyName === "background-color") {
          resolve("css transition canceled: " + event.toString());
        } else {
          reject(
            new Error(
              "CSS transition of an unexpected property - " + event.toString()
            )
          );
        }
      };
      domElement.addEventListener("transitionend", transitionEndEventHandler);
      domElement.addEventListener(
        "transitioncancel",
        transitionCancelEventHandler
      );
      domElement.classList.add(cssClass);
    } catch (error) {
      reject(
        new Error("Caught error in cssTransitionEnded: " + error.toString())
      );
    }
  });

  const timeoutPromise = new Promise((resolve, _) => {
    setTimeout(() => {
      resolve("timeout");
    }, timeout);
  });

  return Promise.race([cssTransitionPromise, timeoutPromise]);
}

async function autoPlayTerminated(reader) {
  return new Promise((resolve, reject) => {
    try {
      reader.eventTarget = new EventTarget();
      const target = reader.eventTarget;
      const autoPlayTermEventHandler = function (event) {
        try {
          target.removeEventListener(event.type, autoPlayTermEventHandler);
          reader.eventTarget = null;
          resolve();
        } catch (error) {
          reject(error);
        }
      };
      target.addEventListener("autoplayterminate", autoPlayTermEventHandler);
      reader.autoPlayActive = false;
    } catch (error) {
      reject(error);
    }
  });
}

export {
  dispatchWorker,
  workerMessageScheme,
  cssTransitionEnded,
  messageSchemeComparator,
  handleResponse,
  autoPlayTerminated,
};
