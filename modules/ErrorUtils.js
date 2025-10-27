/**
 * @module ErrorUtils
 * @description Provides a centralized function for error event logging.
 */

/**
 * Processes an error object and logs its properties to the console.
 * @param {Error | ErrorEvent | any} error - The error object to handle.
 * @param {boolean} [isWorker=false] - Flag to indicate if the call is from a Web Worker.
 */
function handleErrorEvent(error, isWorker = false) {
  // Ensure we have an Error object to get a stack, or create a basic one
  const err = error instanceof Error ? error : new Error(String(error));

  // Construct the standard error log object
  const logObject = {
    message: err.message || "An unknown error occurred.",
    filename: err.fileName || err.sourceURL || "N/A", // Worker/Browser compatibility
    lineno: err.lineNumber || err.lineNo || "N/A", // Worker/Browser compatibility
    callstack: err.stack || "No stack trace available.",
    context: isWorker ? "Web Worker" : "Main Thread",
  };

  // Log the single object (You can easily send this object to a server here)
  console.error("--- Application Error ---");
  console.error(JSON.stringify(logObject, null, 2));
  console.error("-------------------------");
  return JSON.stringify(logObject, null, 2);
}

export { handleErrorEvent };
