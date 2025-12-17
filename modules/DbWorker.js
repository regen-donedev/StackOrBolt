/**
 * @module DbWorker
 * @description This module is executed in a Web Worker context. It handles
 * all IndexedDB API transactions, including game state logs for replay and settings adjustments.
 * @requires module:ConfigState
 * @requires module:Logger
 * @requires module:AsyncAPIWrapper
 * @requires module:ErrorUtils
 */
import { handleErrorEvent } from "./ErrorUtils.js";
import { Settings } from "./ConfigState.js";
import { workerMessageScheme } from "./AsyncAPIWrapper.js";
import { LOGGER_DB_ITEMS } from "./Logger.js";

const idbFactory = self.indexedDB ?? null;
let db = null;
const dbVersion = 37;
let initFromScratch = false;

/**
 * Returns all game identifier index keys from the replayLogger object store,
 * which represent the unique Date() timestamp for a game.
 * @param {String} objStoreName
 * @param {String} indexName
 * @param {Number} indexKey
 * @returns {Promise<Number[]>} - An array of game identifiers
 */
async function getKeysFromIndexOnly(objStoreName, indexName, indexKey) {
  return new Promise((resolve, reject) => {
    try {
      const keyRange = IDBKeyRange.only(indexKey);
      let allPrimaryKeys;
      const xact = db.transaction(objStoreName, "readonly");
      const objStore = xact.objectStore(objStoreName);
      const index = objStore.index(indexName);
      const request = index.getAllKeys(keyRange);
      request.addEventListener("error", (event) => {
        reject(new Error(event.target.error));
      });
      request.addEventListener("success", (event) => {
        allPrimaryKeys = event.target.result;
      });
      xact.addEventListener("complete", () => {
        resolve(allPrimaryKeys);
      });
      xact.addEventListener("error", (event) => {
        reject(new Error(event.target.error));
      });
      xact.addEventListener("abort", (event) => {
        reject(new Error(event.target.error));
      });
      xact.commit();
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Returns all primary keys for a given game identifier Date() timestamp,
 * where each primary key points to the logged record for a specific move on the board.
 * @param {String} objStoreName
 * @param {String} indexName
 * @returns {Promise<Object[]>}
 */
async function getAllIndexKeys(objStoreName, indexName) {
  return new Promise((resolve, reject) => {
    try {
      let allIndexKeys = [];
      const xact = db.transaction(objStoreName, "readonly");
      const objStore = xact.objectStore(objStoreName);
      const index = objStore.index(indexName);
      const request = index.openKeyCursor(
        IDBKeyRange.lowerBound(0),
        "nextunique"
      );
      request.addEventListener("error", (event) => {
        reject(new Error(event.target.error));
      });
      request.addEventListener("success", (event) => {
        xact.addEventListener("complete", () => {
          resolve(allIndexKeys);
        });
        xact.addEventListener("error", (event) => {
          reject(new Error(event.target.error));
        });
        xact.addEventListener("abort", (event) => {
          reject(new Error(event.target.error));
        });
        const cursor = event.target.result;
        if (cursor) {
          allIndexKeys.push(cursor.key);
          cursor.continue();
        } else {
          xact.commit();
        }
      });
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Commits a transaction for a specific objectstore.
 * @param {String} objStoreName
 * @param {String} method
 * @param {*} parm
 * @returns {Promise<Object>}
 */
async function storeXact(objStoreName, method, parm = null) {
  return new Promise((resolve, reject) => {
    try {
      let requestResult = "";
      const xact = db.transaction(objStoreName, "readwrite");
      const objStore = xact.objectStore(objStoreName);
      let request = null;
      switch (method) {
        case "put":
          request = objStore.put(parm);
          break;
        case "get":
          request = objStore.get(parm);
          break;
        case "clear":
          request = objStore.clear();
          break;
        case "delete":
          request = objStore.delete(parm);
          break;
        default:
          throw new Error("Invalid method: " + method);
      }
      request.addEventListener("success", (event) => {
        requestResult = event.target.result;
      });
      request.addEventListener("error", (event) => {
        reject(new Error(event.target.error));
      });
      xact.addEventListener("complete", () => {
        resolve(requestResult);
      });
      xact.addEventListener("error", (event) => {
        reject(new Error(event.target.error));
      });
      xact.addEventListener("abort", (event) => {
        reject(new Error(event.target.error));
      });
      xact.commit();
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * opens the IndexedDB database
 * @returns {Promise<Object>}
 */
async function openDb() {
  return new Promise((resolve, reject) => {
    try {
      const dbRequest = idbFactory.open("StackOrBolt", dbVersion);
      dbRequest.addEventListener("upgradeneeded", (event) => {
        initFromScratch = true;
        const db = event.target.result;
        Array.from(db.objectStoreNames).forEach((name, _) => {
          db.deleteObjectStore(name);
        });
        const objStoreLogger = db.createObjectStore(
          LOGGER_DB_ITEMS.OBJECT_STORE,
          {
            keyPath: LOGGER_DB_ITEMS.KEY_PATH,
          }
        );
        objStoreLogger.createIndex(
          LOGGER_DB_ITEMS.INDEX_NAME,
          LOGGER_DB_ITEMS.INDEX_NAME,
          { unique: false }
        );
        db.createObjectStore(Settings.objStoreName, {
          keyPath: Settings.keyPathName,
        });
      });
      dbRequest.addEventListener("success", (event) => {
        resolve(event.target.result);
      });
      dbRequest.addEventListener("error", (event) => {
        throw new Error("Error opening IndexedDB:", event.target.error);
      });
      dbRequest.addEventListener("blocked", (event) => {
        throw new Error("Error opening IndexedDB:", event.target.error);
      });
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Creates a new indexDB database, if appropriate, and opens it.
 * @returns {Promise<void>}
 */
async function open() {
  if (idbFactory === null) {
    throw new Error(
      "IndexedDB is not supported in this browser. Please use a modern browser."
    );
  }
  if (db === null) {
    db = await openDb();
  }
  if (initFromScratch === true) {
    await storeXact(LOGGER_DB_ITEMS.OBJECT_STORE, "clear");
    await storeXact(Settings.objStoreName, "clear");
    await storeXact(Settings.objStoreName, "put", Settings.factoryWinningRules);
    await storeXact(Settings.objStoreName, "put", Settings.factorySearchRules);
    await storeXact(
      Settings.objStoreName,
      "put",
      Settings.factoryMaterialAdvantageConquered
    );
    await storeXact(
      Settings.objStoreName,
      "put",
      Settings.factorySafetyZoneProximity
    );
    await storeXact(
      Settings.objStoreName,
      "put",
      Settings.factoryMaterialAdvantageAccounted
    );
    initFromScratch = false;
  }
}

/**
 * Handles all message events from the main thread.
 * @returns {Promise<void>}
 */
self.addEventListener("message", async (event) => {
  try {
    const response = structuredClone(event.data);
    switch (event.data.request.type) {
      case "open":
        await open();
        response.response.error = false;
        response.response.message = null;
        self.postMessage(response);
        break;
      case "get":
        const recordGet = await storeXact(
          event.data.request.parameter[0],
          "get",
          event.data.request.parameter[1]
        );
        response.response.error = false;
        response.response.message = recordGet;
        self.postMessage(response);
        break;
      case "put":
        const key = await storeXact(
          event.data.request.parameter[0],
          "put",
          event.data.request.parameter[1]
        );
        response.response.error = false;
        response.response.message = key;
        self.postMessage(response);
        break;
      case "delete":
        await storeXact(
          event.data.request.parameter[0],
          "delete",
          event.data.request.parameter[1]
        );
        response.response.error = false;
        response.response.message =
          "record for primary key deleted: " +
          String(event.data.request.parameter[1]);
        self.postMessage(response);
        break;
      case "getAllIndexKeys":
        const allIndexKeys = await getAllIndexKeys(
          event.data.request.parameter[0],
          event.data.request.parameter[1]
        );
        response.response.error = false;
        response.response.message = allIndexKeys;
        self.postMessage(response);
        break;
      case "getKeysFromIndexOnly":
        const allPrimaryKeys = await getKeysFromIndexOnly(
          event.data.request.parameter[0],
          event.data.request.parameter[1],
          event.data.request.parameter[2]
        );
        response.response.error = false;
        response.response.message = allPrimaryKeys;
        self.postMessage(response);
        break;
      default:
        throw new Error("invalid request type for db worker");
    }
  } catch (error) {
    const errorResponse = structuredClone(workerMessageScheme);
    errorResponse.response.error = true;
    errorResponse.response.message =
      "Caught error in DbWorker: " + handleErrorEvent(error);
    self.postMessage(errorResponse);
  }
});

/**
 * Handles unhandled error events in this web worker thread
 * @returns {void}
 */
self.addEventListener("error", (event) => {
  handleErrorEvent(error);
  handleErrorEvent(new Error("Uncaught error in DbWorker"));
});
