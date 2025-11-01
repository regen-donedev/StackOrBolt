/**
 * @module AsnycAPIWrapper
 * @description This module provides an Async/Await Wrapper API for the following tasks:
 *                - Event-based messaging between the main thread and a Web Worker instance.
 *                - Triggering and waiting for dispatched CSS transition events.
 *                - Event Listener handling for custom dispatched events in the main thread.
 * @exports  dispatchWorker - Handles the event messaging interface between main thread and web worker.
 * @exports workerMessageScheme - Basic object layout for the message
 * @exports cssTransitionEnded - Handles the background-color transition end event
 * for a div element related to a cell on the board
 * @exports messageSchemeComparator - Validates the object sent back from the web worker thread.
 * @exports handleResponse - Throws an error if the posted message object from a web worker is invalid.
 * @exports autoPlayTerminated - Handles the dispatched custom EventTarget for auto-replay termination (clicked on the pause icon)
 */

const workerMessageScheme = Object.freeze({
  request: { type: "", parameter: [] },
  response: { error: false, message: null },
});

const defaultTimeout = 5000;

/**
 * Validates the object sent back from the web worker thread.
 * @param {Object} object
 * @returns {boolean}
 */
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

/**
 * Throws an error if the posted message object from a web worker is invalid.
 * @param {Object} respMsg
 * @returns {void}
 * @throws {ErrorEvent}
 */
function handleResponse(respMsg) {
  if (!messageSchemeComparator(respMsg)) {
    throw new Error("Uncaught error from db worker: " + respMsg.toString());
  }
  if (respMsg.response.error === true) {
    throw new Error("Caught error from db worker: " + respMsg.response.message);
  }
}

/**
 * Handles the event messaging interface between main thread and web worker.
 * @param {Worker} worker
 * @param {Object} message
 * @param {Number} timeout
 * @returns {Promise<Object>|Promise<Error>}
 */
async function dispatchWorker(worker, message, timeout = defaultTimeout) {
  let timeoutElement;
  let workerEventResolve;
  let workerEventReject;
  const messageEventHandler = function (event) {
    const respMsg = event.data;
    if (messageSchemeComparator(respMsg) === false) {
      workerEventReject(
        new Error(
          "invalid response message format for worker: " + respMsg.toString()
        )
      );
    }
    resourceCleanUp();
    workerEventResolve(respMsg);
  };
  const errorEventHandler = function (event) {
    workerEventReject(
      new Error("Uncaught error for worker: " + event.toString())
    );
  };
  const resourceCleanUp = function () {
    worker.removeEventListener("message", messageEventHandler);
    worker.removeEventListener("error", errorEventHandler);
    clearTimeout(timeoutElement);
  };
  const timeoutPromise = new Promise((resolve, reject) => {
    try {
      timeoutElement = setTimeout(() => {
        const timeoutMessage = structuredClone(workerMessageScheme);
        timeoutMessage.response.error = true;
        timeoutMessage.response.message = "timeout";
        resourceCleanUp();
        resolve(timeoutMessage);
      }, timeout);
    } catch (error) {
      reject(error);
    }
  });
  const workerPromise = new Promise((resolve, reject) => {
    try {
      workerEventResolve = resolve;
      workerEventReject = reject;
      worker.addEventListener("message", messageEventHandler);
      worker.addEventListener("error", errorEventHandler);
      if (messageSchemeComparator(message) === false) {
        throw new Error(
          "invalid request message format for worker: " + message.toString()
        );
      }
      worker.postMessage(message);
    } catch (error) {
      reject(error);
    }
  });
  return Promise.race([workerPromise, timeoutPromise]);
}

/**
 * This function resolves the returned promise,
 * if the background-color transition of a div element has ended.
 * @param {HTMLDivElement} domElement
 * @param {String} cssClass
 * @param {Number} timeout
 * @returns {Promise<void>|Promise<Error>}
 */
async function cssTransitionEnded(
  domElement,
  cssClass,
  timeout = defaultTimeout
) {
  let timeoutElement;
  let transitionResolve;
  const transitionEventHandler = function (event) {
    if (
      event.propertyName === "background-color" &&
      event.target === domElement
    ) {
      resourceCleanUp();
      transitionResolve();
    }
  };
  const resourceCleanUp = function () {
    domElement.removeEventListener("transitioncancel", transitionEventHandler);
    domElement.removeEventListener("transitionend", transitionEventHandler);
    clearTimeout(timeoutElement);
  };
  const timeoutPromise = new Promise((resolve, reject) => {
    try {
      timeoutElement = setTimeout(() => {
        resourceCleanUp();
        resolve();
      }, timeout);
    } catch (error) {
      reject(error);
    }
  });
  const cssTransitionPromise = new Promise((resolve, reject) => {
    try {
      transitionResolve = resolve;
      domElement.addEventListener("transitionend", transitionEventHandler);
      domElement.addEventListener("transitioncancel", transitionEventHandler);
      domElement.classList.add(cssClass);
    } catch (error) {
      reject(error);
    }
  });
  return Promise.race([cssTransitionPromise, timeoutPromise]);
}

/**
 * This function resolves, if a new custom event
 * gets dipatched for a LoggerReader EventTarget instance.
 * @param {LoggerReader} reader
 * @returns {Promise<void>|Promise<Error>}
 */
async function autoPlayTerminated(reader, timeout = defaultTimeout) {
  let timeoutElement;
  let autoPlayResolve;
  reader.eventTarget = new EventTarget();
  const target = reader.eventTarget;
  const autoPlayTermEventHandler = function (event) {
    reader.eventTarget = null;
    resourceCleanUp();
    autoPlayResolve();
  };
  const resourceCleanUp = function () {
    target.removeEventListener("autoplayterminate", autoPlayTermEventHandler);
    clearTimeout(timeoutElement);
  };
  const timeoutPromise = new Promise((_, reject) => {
    try {
      timeoutElement = setTimeout(() => {
        throw new Error("unexpected timeout during autoplay termination");
      }, timeout);
    } catch (error) {
      reject(error);
    }
  });
  const autoPlayPromise = new Promise((resolve, reject) => {
    try {
      autoPlayResolve = resolve;
      target.addEventListener("autoplayterminate", autoPlayTermEventHandler);
      reader.autoPlayActive = false;
    } catch (error) {
      reject(error);
    }
  });
  return Promise.race([autoPlayPromise, timeoutPromise]);
}

export {
  dispatchWorker,
  workerMessageScheme,
  cssTransitionEnded,
  messageSchemeComparator,
  handleResponse,
  autoPlayTerminated,
};
