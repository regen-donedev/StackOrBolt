/**
 * @module Logger
 * @description This module exports the LoggerWirter and LoggerReader classes,
 * which are essential for logging and fetching historic game moves from the database.
 * @requires module:AsyncAPIWrapper
 * @requires module:GameState
 * @exports LoggerWriter - The LoggerWriter class taht manages logging the game state to the IndexedDB database
 * @exports LOGGER_DB_ITEMS - Constants
 * @exports LoggerReader - The LoggerReader class that manages the game replay state
 * @exports cacheAllIndexKeys - Helper function for pre-loading all game history metadata
 * @exports cacheKeysFromIndex - Helper function to cache all primary keys for a LoggerReader instance
 */
import {
  dispatchWorker,
  workerMessageScheme,
  handleResponse,
} from "./AsyncAPIWrapper.js";
import { PLAYER_ID } from "./GameState.js";

const LOGGER_DB_ITEMS = Object.freeze({
  OBJECT_STORE: "ReplayLog",
  KEY_PATH: "id",
  INDEX_NAME: "gameId",
});

/**
 * This helper functions is necessary to maintain high level meta informations
 * for the last 10 games.
 * @returns {Promise<Object>}
 */
async function cacheAllIndexKeys() {
  const request = structuredClone(workerMessageScheme);
  request.request.type = "getAllIndexKeys";
  request.request.parameter.push(LOGGER_DB_ITEMS.OBJECT_STORE);
  request.request.parameter.push(LOGGER_DB_ITEMS.INDEX_NAME);
  const workerResponse = await dispatchWorker(LoggerWriter.dbWorker, request);
  handleResponse(workerResponse);
  return workerResponse.response.message;
}

/**
 * This helper function is necessary to maintain database information for
 * the last 10 games.
 * Based on these cached primary keys, obsolete records will be deleted from the databse
 * and active records can be dynamically fetched by using the replay icons (backward/play/pause/forward)
 * on the footer.
 * @param {Number} indexKey - The game identifier timestamp
 * @returns
 */
async function cacheKeysFromIndex(indexKey) {
  const request = structuredClone(workerMessageScheme);
  request.request.type = "getKeysFromIndexOnly";
  request.request.parameter.push(LOGGER_DB_ITEMS.OBJECT_STORE);
  request.request.parameter.push(LOGGER_DB_ITEMS.INDEX_NAME);
  request.request.parameter.push(indexKey);
  const workerResponse = await dispatchWorker(LoggerWriter.dbWorker, request);
  handleResponse(workerResponse);
  return workerResponse.response.message;
}

/**
 * Log each new game move to the database, maintain the wraparound tables for
 * the last 10 games, manage new LoggerReader instances created after the first move on a new game.
 *
 * @class
 * @property {BoardState} boardState
 * @property {Number} gameid
 * @property {Move} move
 * @constructor
 * @param {BoardState} boardState
 */
class LoggerWriter {
  /**
   * The current board state.
   * @private
   * @type {BoardState}
   * @readonly
   */
  _boardState;

  /**
   * The start date for this game.
   * This property maps the gameId index of the ReplayLog object store.
   * @private
   * @type {Number}
   */
  _gameId;

  /**
   * The number of moves currently applied to the game.
   * This property maps the move index of the ReplayLog object store.
   * @private
   * @type {Number}
   */
  _move;

  /**
   * @static
   * @type {Worker}
   */
  static dbWorker;

  /**
   * Holds the current live instance of the LoggerWriter related to the active board in the dom.
   * @static
   * @type {LoggerWriter}
   */
  static currentLiveInstance = null;

  /**
   * Creates a new LoggerWriter instance.
   * @constructor
   * @param {BoardState} boardState - The current board state.
   */
  constructor(boardState) {
    if (!LoggerWriter.dbWorker || !(LoggerWriter.dbWorker instanceof Worker)) {
      throw new Error(
        "LoggerWriter: invalid web worker instance for db requests"
      );
    }
    this._boardState = boardState;
    this._gameId = Date.now();
    this._move = 0;
  }

  /**
   * Gets the current board state.
   * @public
   * @type {BoardState}
   * @returns {BoardState}
   * @readonly
   */
  get boardState() {
    return this._boardState;
  }

  /**
   * Gets the current start date for this game.
   * @public
   * @type {Date}
   * @returns {Date}
   * @readonly
   */
  get gameId() {
    return this._gameId;
  }

  /**
   * Gets the current move.
   * @public
   * @type {Number}
   * @returns {Number}
   * @readonly
   */
  get move() {
    return this._move;
  }

  /**
   * Sets the total number of moves to zero on game reset.
   * @public
   * @param {Number} move
   */
  set move(value) {
    this._move = value;
  }

  /**
   * Sets the current start date on game reset.
   * @public
   * @param {Number} gameId
   */
  set gameId(value) {
    this._gameId = value;
  }

  /**
   * Logs the initial boardstate before the first user's move.
   * @returns {Promise<void>}
   */
  async #firstUpdate() {
    const key = Date.now();
    const record = {
      id: key,
      gameId: this._gameId,
      move: this._move,
      boardState: structuredClone(LoggerReader.initialDomBoardState),
      lastMove: null,
    };
    const request = structuredClone(workerMessageScheme);
    request.request.type = "put";
    request.request.parameter.push(LOGGER_DB_ITEMS.OBJECT_STORE);
    request.request.parameter.push(record);
    const workerResponse = await dispatchWorker(LoggerWriter.dbWorker, request);
    handleResponse(workerResponse);
    LoggerReader.instances.get(this._gameId).addPrimaryKey(key);
  }

  /**
   * Logs the current boardstate and the last applied move to the database.
   * @public
   * @param {Move} - the last applied move.
   * @returns {Promise<void>}
   */
  async update(lastMove) {
    if (this._move === 0) {
      const allIndexKeys = await cacheAllIndexKeys();
      if (allIndexKeys.length > 9) {
        for (let i = 0, len = allIndexKeys.length - 9; i < len; i++) {
          const reader = LoggerReader.instances.get(allIndexKeys[i]);
          LoggerReader.dispose(reader);
          let allPrimaryKeys = await cacheKeysFromIndex(allIndexKeys[i]);
          for (const key of allPrimaryKeys) {
            const request = structuredClone(workerMessageScheme);
            request.request.type = "delete";
            request.request.parameter.push(LOGGER_DB_ITEMS.OBJECT_STORE);
            request.request.parameter.push(key);
            const workerResponse = await dispatchWorker(
              LoggerWriter.dbWorker,
              request
            );
            handleResponse(workerResponse);
          }
        }
      }
      const reader = new LoggerReader(this._gameId);
      await this.#firstUpdate();
    }
    this._move++;
    const key = Date.now();
    const record = {
      id: key,
      gameId: this._gameId,
      move: this._move,
      boardState: structuredClone(this._boardState.cloneInstance()),
      lastMove: structuredClone(lastMove.cloneInstance()),
    };
    const request = structuredClone(workerMessageScheme);
    request.request.type = "put";
    request.request.parameter.push(LOGGER_DB_ITEMS.OBJECT_STORE);
    request.request.parameter.push(record);
    const workerResponse = await dispatchWorker(LoggerWriter.dbWorker, request);
    handleResponse(workerResponse);
    const reader = LoggerReader.instances.get(this._gameId);
    reader.addPrimaryKey(key);
    reader.move = this._move;
    const bot = this._boardState.playerState.twoPlayer.find(
      (player) => player.id === PLAYER_ID.BOT
    );
    const user = this._boardState.playerState.twoPlayer.find(
      (player) => player.id === PLAYER_ID.USER
    );
    if (bot.winner === true) {
      reader.winner = PLAYER_ID.BOT;
    }
    if (user.winner === true) {
      reader.winner = PLAYER_ID.USER;
    }
    reader.updateScrollItemElements();
  }
}

/**
 * Holds high level meta information for a game and caches all primary keys
 * related to a specific game state.
 * Contains cursor management functionality
 * for fetching the next game state record from the database, based on dom user interactions.
 * @class
 * @property {Number} gameid
 * @property {Number[]} primaryKeys
 * @property {AsyncGenerator} generator - This async generator function emulates a database cursor state
 *                                        by yielding and managing the index value for all cached primary keys.
 * @property {String} winner
 * @property {Number} move
 * @property {HTMLDivElement} scrollItem - A CSS scroll container item containing high level
 *                                         text content for this game.
 *                                         This element is contained inside the game history selection dialog,
 *                                         opened by clicking on the upload icon in the navigation bar.
 * @property {Boolean} autoPlayActive - Returns true if auto replay is active, i.e. if the play icon was clicked.
 * @property {EventTarget} eventTarget - A new custom event will be dispatched on this helper property,
 *                                       in order to terminate the auto play mode in a synchronous manner.
 *
 * @constructor
 * @param {Number} gameid
 */
class LoggerReader {
  /**
   * The start date for an index key value of the ReplayLog object store.
   * @private
   * @type {Number}
   */
  _gameId;

  /**
   * All cached primary keys for the index key of this instance.
   * @private
   * @type {Number[]}
   */
  _primaryKeys;

  /**
   * This AsyncGenerator function object acts as a pseudo db cursor state manager, because it
   * emulates the advance() method of the IDBCursor interface.
   * The number of steps to advance is yielded and the
   * index of the primaryKeys array is updated, before the next
   * record from the object store is fetched.
   * @private
   * @type {AsyncGenerator}
   */
  _generator;

  /**
   * The winner of this logged game (if any).
   * This info will be displayed in the dialog modal.
   * @private
   * @type {String}
   */
  _winner;

  /**
   * The number of moves for this logged game.
   * This info will be displayed in the dialog modal.
   * @private
   * @type {Number}
   */
  _move;

  /**
   * The html scroll item container element inside the dialog
   * containing the instance properties for game replay selection.
   * @private
   * @type {HTMLDivElement}
   */
  _scrollItem;

  /**
   * controls if the auto play mode is active or not.
   * @private
   * @type {Boolean}
   */
  _autoPlayActive;

  /**
   * Helper EventTarget instance to dispatch an event on auto play termination.
   * @private
   * @type {EventTarget | null}
   */
  _eventTarget;

  /**
   * @static
   * @type {Map<Number, LoggerReader>}
   */
  static instances = new Map();
  static historyBoard = null;
  static initialDomBoardState;
  static currentSelectedInstance = null;
  static playerHistoryUser = null;
  static playerHistoryBot = null;
  static scrollItemTemplate = null;
  static scrollContainer = null;

  static dispose(gameId) {
    if (LoggerReader.instances.has(gameId)) {
      const reader = LoggerReader.instances.get(gameId);
      if (reader.generator) {
        reader.generator.return();
        reader.generator = null;
      }
      reader.scrollItem.remove();
      reader.scrollItem = null;
      reader = null;
      LoggerReader.instances.delete(gameId);
    }
  }

  /**
   * Creates a new LoggerReader instance.
   * @constructor
   * @param {Number} gameId - The gameId index key value of the ReplayLog object store.
   */
  constructor(gameId) {
    if (!LoggerWriter.dbWorker || !(LoggerWriter.dbWorker instanceof Worker)) {
      throw new Error(
        "LoggerReader: invalid web worker instance for db requests"
      );
    }
    this._gameId = gameId;
    this._primaryKeys = [];
    this._generator = this.generatorFactory();
    this._winner = "none";
    this._move = 0;
    this._autoPlayActive = false;
    this._eventTarget = null;
    const fragment = LoggerReader.scrollItemTemplate.content.cloneNode(true);
    LoggerReader.scrollContainer.appendChild(fragment);
    this._scrollItem = Array.from(LoggerReader.scrollContainer.children).at(-1);
    this.updateScrollItemElements();
    LoggerReader.instances.set(this._gameId, this);
  }

  /**
   * Gets the gameId index key value.
   * @public
   * @type {Number}
   * @returns {Number}
   * @readonly
   */
  get gameId() {
    return this._gameId;
  }

  /**
   * Gets the array containing all primary keys.
   * @public
   * @type {Number[]}
   * @returns {Number[]}
   * @readonly
   */
  get primaryKeys() {
    return this._primaryKeys;
  }

  /**
   * Gets the async generator function object.
   * @public
   * @type {AsyncGenerator}
   * @returns {AsyncGenerator}
   * @readonly
   */
  get generator() {
    return this._generator;
  }

  /**
   * Sets the async generator function object.
   * @public
   * @param {AsyncGenerator | null} value
   */
  set generator(value) {
    this._generator = value;
  }

  /**
   * Gets the winner for this logged game history.
   * @public
   * @type {String}
   * @returns {String}
   * @readonly
   */
  get winner() {
    return this._winner;
  }

  /**
   * Sets the winner for this logged game history.
   * @public
   * @param {String} value
   */
  set winner(value) {
    this._winner = value;
  }

  /**
   * Gets the number of played moves for this logged game history.
   * @public
   * @type {Number}
   * @returns {Number}
   * @readonly
   */
  get move() {
    return this._move;
  }

  /**
   * Sets the number of played moves for this logged game history.
   * @public
   * @param {Number} value
   */
  set move(value) {
    this._move = value;
  }

  /**
   * Gets the flag to control auto play mode.
   * @public
   * @type {Boolean}
   * @returns {Boolean}
   * @readonly
   */
  get autoPlayActive() {
    return this._autoPlayActive;
  }

  /**
   * Sets the flag to control auto play mode.
   * @public
   * @param {Boolean} value
   */
  set autoPlayActive(value) {
    this._autoPlayActive = value;
  }

  /**
   * Gets the EventTarget property.
   * @public
   * @type {EventTarget | null}
   * @returns {EventTarget | null}
   * @readonly
   */
  get eventTarget() {
    return this._eventTarget;
  }

  /**
   * Sets the EventTarget property.
   * @public
   * @param {EventTarget | null} value
   */
  set eventTarget(value) {
    this._eventTarget = value;
  }

  /**
   * Gets the html scroll item container element inside the dialog.
   * @public
   * @type {HTMLDivElement}
   * @returns {HTMLDivElement}
   * @readonly
   */
  get scrollItem() {
    return this._scrollItem;
  }

  /**
   * updates the css scroll container item text content, containing the high level meta
   * information for this game.
   * @returns {void}
   */
  updateScrollItemElements() {
    this._scrollItem.setAttribute("data-db-key", String(this._gameId));
    const startDate = new Date(this._gameId);
    this._scrollItem.querySelector(".panelGameStarted").innerText =
      startDate.toLocaleString();
    this._scrollItem.querySelector(".panelTotalMoves").innerText = String(
      this._move
    );
    this._scrollItem.querySelector(".panelGameWinner").innerText = this._winner;
    const itemGameFinished =
      this._scrollItem.querySelector(".panelGameFinished");
    itemGameFinished.innerText =
      this._winner === "none" ? "ongoing" : "finished";
  }

  /**
   * Adds a new primary key whenever a new move is played on the dom live game, or
   * at initial page load when creating the LoggerReader instances from database records.
   * @param {Number} key
   * @returns {void}
   */
  addPrimaryKey(key) {
    this._primaryKeys.push(key);
  }

  /**
   * Initializes new AsyncGenerator property of this instance.
   * @returns {AsyncGenerator}
   */
  async *generatorFactory() {
    if (this.primaryKeys.length === 0) {
      return;
    }
    let cursorIndex = this.primaryKeys.length - 1;
    let request = null;
    let workerResponse = null;
    let record = null;
    let key = 0;
    request = structuredClone(workerMessageScheme);
    request.request.type = "get";
    key = this.primaryKeys[cursorIndex];
    request.request.parameter.push(LOGGER_DB_ITEMS.OBJECT_STORE);
    request.request.parameter.push(key);
    workerResponse = await dispatchWorker(LoggerWriter.dbWorker, request);
    handleResponse(workerResponse);
    record = structuredClone(workerResponse.response.message);
    yield record;
    while (true) {
      const advanceSteps = yield;
      switch (advanceSteps) {
        case Infinity:
          cursorIndex = this.primaryKeys.length - 1;
          break;
        case -Infinity:
          cursorIndex = 0;
          break;
        default:
          cursorIndex += advanceSteps;
      }
      if (this.primaryKeys.length === 0) {
        return;
      }
      if (cursorIndex < 0) {
        cursorIndex = 0;
      }
      if (cursorIndex > this.primaryKeys.length - 1) {
        cursorIndex = this.primaryKeys.length - 1;
      }
      request = structuredClone(workerMessageScheme);
      request.request.type = "get";
      key = this.primaryKeys[cursorIndex];
      request.request.parameter.push(LOGGER_DB_ITEMS.OBJECT_STORE);
      request.request.parameter.push(key);
      workerResponse = await dispatchWorker(LoggerWriter.dbWorker, request);
      handleResponse(workerResponse);
      record = structuredClone(workerResponse.response.message);
      yield record;
    }
  }

  /**
   * Returns the next database record for the inquired game state.
   * @param {Number} advanceSteps
   * @returns {Promise<Object>}
   */
  async fetchRecord(advanceSteps) {
    const result = await this._generator.next(advanceSteps);
    if (result.done === true) {
      throw new Error(
        "error 1 in fetchRecord: Unconditional return in AsyncGenerator object"
      );
    }
    await this._generator.next();
    if (result.done === true) {
      throw new Error(
        "error 2 in fetchRecord: Unconditional return in AsyncGenerator object"
      );
    }
    return result.value;
  }
}

export {
  LOGGER_DB_ITEMS,
  LoggerWriter,
  LoggerReader,
  cacheAllIndexKeys,
  cacheKeysFromIndex,
};
