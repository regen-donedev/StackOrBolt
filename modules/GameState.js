/**
 * @module GameState
 * @description This module provides classes that represent the state of the board,
 * its cells, both players, the sidebars and the moves made during the game.
 * It includes the GridCell class for individual cells, BoardState for the overall board state,
 * Player for player-specific state, PlayerState for managing multiple players,
 * Sidebar for visualizing each current player's state
 * and Move for representing and logging a move in the game.
 * @requires module:GameLogic
 * @property {Object} PLAYER_ID - An immutable object containing primitive unique identifiers for both players.
 * @exports PLAYER_ID - An immutable object containing primitive unique identifiers for both players.
 * @exports GridCell - Represents a single cell in the game board, managing its state and DOM relation.
 * @exports BoardState - Represents the state of the game board, managing an array of GridCell instances and player states.
 * @exports Player - Represents a player in the game, encapsulating player-specific state and actions.
 * @exports PlayerState - Represents the state of players in the game, managing an array of Player instances.
 * @exports Move - Represents a move in the game, including the source cell, target cell, and the player's state.
 * @exports Sidebar - Visualizing each player's state.
 */
import { playMove, switchPlayer } from "./GameLogic.js";
const PLAYER_ID = Object.freeze({
  USER: "user",
  BOT: "bot",
});
const NEW_VAULT = Object.freeze({
  self: 0,
  opponent: 0,
});

/**
 * Represents a single cell in a grid for the TowerStack game.
 * An instance can either reference a DOM element or not.
 * If so, it represents the current state in the browser UI.
 * If not, it is a cloned deep copy and only used as a working instance for
 * the minimax search tree traversal processed in the spawned web worker.
 *
 * @class
 * @property {number} id - Unique identifier for the cell, calculated from row and column.
 * @property {number} row - The row index of the cell.
 * @property {number} column - The column index of the cell.
 * @property {boolean} domRelation - Whether this cell has a DOM element associated.
 * @property {HTMLElement|null} domEl - The DOM element representing this cell, or null if not applicable.
 * @property {Array<string>} svgLayout - The current metadata for the tower (piece) on the board.
 * Each array element represents a stone put on top of the tower for some past move.
 * @property {number} direction - The direction value for the cell (e.g., for reverse movement).
 * @property {boolean} dot - Whether this cell contains a dot as UI indication for reverse direction movement.
 *
 * @constructor
 * @param {number} row - The row index of the cell.
 * @param {number} column - The column index of the cell.
 * @param {boolean} [domRelation=false] - Whether to create a DOM element for this cell.
 * @param {Array<string>} [svgLayout=[]] - The initial SVG layout for this cell.
 * @param {number} [direction=0] - The initial direction value.
 * @param {boolean} [dot=false] - Whether this cell contains a dot.
 * @throws {Error} If no SVG elements are found in the GridCell's DOM element.
 */
class GridCell {
  /**
   * @private
   * @type {number}
   * @readonly
   */
  _id;

  /**
   * @private
   * @type {number}
   * @readonly
   */
  _row;

  /**
   * @private
   * @type {number}
   * @readonly
   */
  _column;

  /**
   * @private
   * @type {boolean}
   * @readonly
   */
  _domRelation;

  /**
   * @private
   * @type {HTMLElement|null}
   * @readonly
   */
  _domEl;

  /**
   * @private
   * @type {Array<string>}
   */
  _svgLayout;

  /**
   * @private
   * @type {number}
   */
  _direction;

  /**
   * @private
   * @type {boolean}
   */
  _dot;

  /**
   * Deserializes a plain object sent to the web worker and returns
   * the corresponding GridCell instance.
   * @static
   * @param {Object} object - The serialized plain javascript object sent to the web worker.
   * @returns {GridCell}
   */
  static createFromStructuredClone(cellPlain) {
    return new GridCell(
      cellPlain._row,
      cellPlain._column,
      false,
      null,
      [...cellPlain._svgLayout],
      cellPlain._direction,
      cellPlain._dot
    );
  }

  /**
   * Creates a new GridCell instance.
   * @constructor
   * @param {number} row - The row index of the cell.
   * @param {number} column - The column index of the cell.
   * @param {boolean} [domRelation=false] - Whether to create a DOM element for this cell.
   * @param {Array<string>} [svgLayout=[]] - The initial SVG layout for this cell.
   * @param {number} [direction=0] - The initial direction value.
   * @param {boolean} [dot=false] - Whether this cell contains a dot.
   * @throws {TypeError} If svgLayout is not an array, or if direction is not a number, or if dot is not a boolean.
   */
  constructor(
    row,
    column,
    domRelation = false,
    domEl = null,
    svgLayout = [],
    direction = 0,
    dot = false
  ) {
    this._row = row;
    this._column = column;
    this._id = this._row * 6 + this._column;
    this._domRelation = domRelation;
    this._svgLayout = svgLayout;
    this._direction = direction;
    this._dot = dot;
    if (this._domRelation === true) {
      this._domEl = domEl;
    } else {
      this._domEl = null;
    }
  }
  /**
   * Gets the unique cell identifier of the board
   * @public
   * @type {number}
   * @returns {number}
   * @readonly
   */
  get id() {
    return this._id;
  }

  /**
   * Gets the unique cell row of the board
   * @public
   * @type {number}
   * @returns {number}
   * @readonly
   */
  get row() {
    return this._row;
  }

  /**
   * Gets the unique cell column of the board
   * @public
   * @type {number}
   * @returns {number}
   * @readonly
   */
  get column() {
    return this._column;
  }

  /**
   * Gets a flag indicating whether this cell has a referenced DOM element or not
   * @public
   * @type {boolean}
   * @returns {boolean}
   * @readonly
   */
  get domRelation() {
    return this._domRelation;
  }

  /**
   * Gets the referenced parent DOM element representing this GridCell instance
   * @public
   * @type {HTMLElement|null}
   * @returns {HTMLElement|null}
   * @readonly
   */
  get domEl() {
    return this._domEl;
  }

  /**
   * Gets the current metadata for the tower (piece) representation on the board.
   * Each array element represents a stone put on top of the tower for some past moves.
   * @public
   * @type {Array<string>}
   * @returns {Array<string>}
   */
  get svgLayout() {
    return this._svgLayout;
  }

  /**
   * Sets the current metadata for the tower (piece) representation on the board.
   * Each array element represents a stone put on top of the tower for some past moves.
   * @public
   * @type {Array<string>}
   * @param {Array<string>} value - The updated svgLayout for a new move
   */
  set svgLayout(value) {
    this._svgLayout = value;
    this.updateSvg();
  }

  /**
   * Gets the vertical movement direction of this GridCell instance
   * @public
   * @type {number}
   * @returns {number}
   * @readonly
   */
  get direction() {
    return this._direction;
  }

  /**
   * Sets and reverses the vertical movement direction of this GridCell instance.
   * A change occurs if the tower representing this cell reached the opponents home zone
   * or if the tower has been conquered by the opponent player.
   * @public
   * @param {number} value - The new direction for vertical movement
   */
  set direction(value) {
    this._direction = value;
  }

  /**
   * Gets the dot flag indicating whether the tower representing this GridCell instance has already reached
   * the opponent home zone and moves in reverse vertical direction.
   * @public
   * @type {boolean}
   * @returns {boolean}
   * @readonly
   */
  get dot() {
    return this._dot;
  }

  /**
   * Sets the dot flag. This must be done whenever a change of direction occured as well, e.G.
   * the tower reached the opponent home zone or has been conquered by the opponent player.
   * @public
   * @param {boolen} value - the new dot flag indicating reverse vertical movement
   */
  set dot(value) {
    this._dot = value;
  }

  /**
   * Add a CSS class to the DOM element.
   * @param {string} className
   * @returns {void}
   */
  addClass(className) {
    if (this.domRelation === false || this._domEl === null) {
      return;
    }
    this._domEl.classList.add(className);
  }

  /**
   * Removes a CSS class from the DOM element.
   * @param {string} className
   * @returns {void}
   */
  removeClass(className) {
    if (this.domRelation === false || this._domEl === null) {
      return;
    }
    this._domEl.classList.remove(className);
  }

  /**
   * Updates the SVG child elements in the cell's DOM element based on the current svgLayout and dot properties.
   * If the cell has a DOM relation, it hides all SVG elements initially,
   * then shows the SVG element corresponding to the current svgLayout and dot state.
   *
   * @returns {void}
   * @throws {Error} If no SVG elelements are found in the GridCell's DOM element,
   */
  updateSvg() {
    if (this.domRelation === false || this._domEl === null) {
      return;
    }
    let svgLayoutString;
    if (this._svgLayout.length === 0) {
      svgLayoutString = "none";
    } else {
      svgLayoutString = this._svgLayout.join("_");
      if (this._dot === true) {
        svgLayoutString += "_dot";
      }
    }
    const svgSymbol = `tower_${svgLayoutString}`;
    this.domEl
      .querySelector("use")
      .setAttribute("href", `./images/pieces.svg#${svgSymbol}`);
  }

  /**
   * Returns a new deep copied instance without any DOM relations.
   * @returns {GridCell} - the new deep copied instance
   */
  cloneInstance() {
    return new GridCell(
      this._row,
      this._column,
      false,
      null,
      [...this._svgLayout],
      this._direction,
      this._dot
    );
  }
}

/**
 * Represents the state of a game board, managing the state of all GridCell and Player instances
 * and optionally their relation to DOM elements.
 * @class
 * @property {GridCell[]} cells - Gets the array of GridCell instances.
 * @property {boolean} domRelation - Gets whether the board state maintains a DOM relation.
 * @property {WeakMap<HTMLElement, GridCell>|null} mapDomElement - Gets the DOM-to-GridCell mapping if domRelation is true, otherwise null.
 * @property {PlayerState} playerState - Gets the state of both players in the game.
 * @property {boolean} disableBoardEvents - Disable all DOM event listeners for this board.
 * @property {boolean} waitForWebWorker - Indicates whether the game board dom interface is diabled and wait for the Web Worker post message.
 *
 * @constructor
 * @param {GridCell[]} cells - An array of GridCell instances representing the cells on the board.
 * @param {PlayerState} playerState - The state of both players in the game.
 * @param {boolean} [domRelation=false] - Whether the board state maintains a DOM relation.
 * @param {boolean} [disableBoardEvents=false] - Disable all DOM event listeners for this board.
 * @param {boolean} [waitForWebWorker=false] - Wait for Web Worker processing and post messaging.
 *
 */
class BoardState {
  /**
   * An array of GridCell instances representing the cells on the board.
   * @private
   * @type {GridCell[]}
   * @readonly
   */
  _cells;

  /**
   * Whether the board state maintains a DOM relation.
   * @private
   * @type {boolean}
   * @readonly
   */
  _domRelation;

  /**
   * A WeakMap mapping DOM elements to GridCell instances if domRelation is true, otherwise null.
   * @private
   * @type {WeakMap<HTMLElement, GridCell>|null}
   * @readonly
   */
  _mapDomElement;

  /**
   * The state of both players in the game.
   * @private
   * @type {PlayerState}

   * @readonly
   */
  _playerState;

  /**
   * Disable all DOM event listeners for the board.
   * @private
   * @type {boolean}
   */
  _disableBoardEvents;

  /**
   * Wait for WebWorker post messaging.
   * @private
   * @type {boolean}
   */
  _waitForWebWorker;

  /**
   * Holds the current live instance of the game board state with DOM relations.
   * @static
   * @type {BoardState}
   */
  static currentLiveInstance = null;

  /**
   * Deserializes a plain object sent to the web worker and returns
   * the corresponding BoardState instance.
   * @static
   * @param {Object} object - The serialized plain javascript object sent to the web worker.
   * @returns {BoardState}}
   */
  static createFromStructuredClone(boardStatePlain) {
    const newCells = [];
    boardStatePlain._cells.forEach((cellPlain) => {
      newCells.push(GridCell.createFromStructuredClone(cellPlain));
    });
    return new BoardState(
      newCells,
      PlayerState.createFromStructuredClone(boardStatePlain._playerState),
      boardStatePlain._domRelation,
      boardStatePlain._disableBoardEvents,
      boardStatePlain._waitForWebWorker
    );
  }

  /**
   *
   * @constructor
   * @param {GridCell[]} cells
   * @param {PlayerState} playerState
   * @param {boolean} domRelation
   * @param {boolean} disableBoardEvents
   * @param {boolean} waitForWebWorker
   */
  constructor(
    cells,
    playerState,
    domRelation = false,
    disableBoardEvents = false,
    waitForWebWorker = false
  ) {
    this._cells = cells;
    this._playerState = playerState;
    this._domRelation = domRelation;
    if (this._domRelation === true) {
      this._mapDomElement = new WeakMap();
      this._cells.forEach((cell) => this._mapDomElement.set(cell.domEl, cell));
    } else {
      this._mapDomElement = null;
    }
    this._disableBoardEvents = disableBoardEvents;
    this._waitForWebWorker = waitForWebWorker;
  }

  /**
   * Gets an array of all GridCell instances referenced by this BoardState instance.
   * @public
   * @type {GridCell[]}
   * @returns {GridCell[]}
   * @readonly
   */
  get cells() {
    return this._cells;
  }

  /**
   * Gets a flag indicating whether this BoardState instance has referenced DOM elements or not.
   * @public
   * @type {boolean}
   * @returns {boolean}
   * @readonly
   */
  get domRelation() {
    return this._domRelation;
  }

  /**
   * Gets a WeakMap that relates all DOM elements to the corresponding GridCell instances
   * of this BoardState instance. Or gets null, if this BoardState instance has no DOM relation.
   * @public
   * @type {WeakMap<HTMLElement, GridCell>|null}
   * @returns {WeakMap<HTMLElement, GridCell>|null}
   * @readonly
   */
  get mapDomElement() {
    return this._mapDomElement;
  }

  /**
   * Gets the PlayerState instance reflecting the current state of both players for this BoardState instance.
   * @public
   * @type {PlayerState}
   * @returns {PlayerState}
   * @readonly
   */
  get playerState() {
    return this._playerState;
  }

  /**
   * Gets a flag used by the DOM event handler delegation
   * for all GridCell related DOM elements (CSS grid cells).
   * For example, while the spawned Web Worker traverses the game search tree,
   * no animations should be triggered for the CSS Grid.
   * @public
   * @type {boolean}
   * @returns {boolean}
   * @readonly
   */
  get disableBoardEvents() {
    return this._disableBoardEvents;
  }

  /**
   * Sets the disableBoardEvents flag to disable all animations for the CSS Grid cells.
   * @public
   * @param {boolean} value - The updated svgLayout for a new move
   */
  set disableBoardEvents(value) {
    this._disableBoardEvents = value;
  }

  /**
   * Gets a flag indicating whether the Web Worker instance has finished processing or not.
   * @public
   * @type {boolean}
   * @returns {boolean}
   * @readonly
   */
  get waitForWebWorker() {
    return this._waitForWebWorker;
  }

  /**
   * Sets a flag indicating whether the Web Worker instance has finished processing or not.
   * @public
   * @param {boolean} value - The updated svgLayout for a new move
   */
  set waitForWebWorker(value) {
    this._waitForWebWorker = value;
  }

  /**
   * Applies a move from the source cell to the target cell and switches the player turn.
   * This method updates the source and target cells' properties based on the move,
   * and then switches the turn to the next player.
   * @param {GridCell} srcCell
   * @param {GridCell} tgtCell
   * @returns {void}
   */
  applyMoveAndTurn(srcCell, tgtCell, maxStackSize) {
    playMove(srcCell, tgtCell, this, maxStackSize);
    switchPlayer(this.playerState);
  }

  /**
   * Undoes a move by restoring the source and target cells to their previous states.
   * This method takes a logged move object, which contains the previous deep copied states of the source and target cells,
   * and the player state at the time of the move. It directly restores the referenced cells and player states
   * to their previous values. It only modifies those properties that werde changed during the move.
   * @param {Move} loggedMove
   * @returns {void}
   */
  undoMove(loggedMove) {
    const srcIndex = loggedMove.srcCell.id;
    const tgtIndex = loggedMove.tgtCell.id;
    this.cells[srcIndex].svgLayout = loggedMove.srcCell.svgLayout;
    this.cells[srcIndex].direction = loggedMove.srcCell.direction;
    this.cells[srcIndex].dot = loggedMove.srcCell.dot;
    this.cells[tgtIndex].svgLayout = loggedMove.tgtCell.svgLayout;
    this.cells[tgtIndex].direction = loggedMove.tgtCell.direction;
    this.cells[tgtIndex].dot = loggedMove.tgtCell.dot;
    this.playerState.twoPlayer.forEach((player) => {
      const savedPlayer = loggedMove.playerState.twoPlayer.find(
        (p) => p.id === player.id
      );
      if (savedPlayer) {
        player.turn = savedPlayer.turn;
        player.lastHorizontal = savedPlayer.lastHorizontal;
        player.safetyTower = savedPlayer.safetyTower;
        player.vault = { ...savedPlayer.vault };
      }
    });
  }

  /**
   * Returns a new deep copied instance without any DOM relations.
   * @returns {BoardState} - the new deep copied instance
   */
  cloneInstance() {
    const newCells = [];
    this._cells.forEach((cell) => newCells.push(cell.cloneInstance()));
    return new BoardState(
      newCells,
      this._playerState.cloneInstance(),
      false,
      false,
      false
    );
  }
}

/**
 * Represents a player in the TowerStack game, encapsulating player-specific state and actions.
 * The Player class manages the state of an individual player, including their identity,
 * turn status, last move history, vault values for conquered towers
 * and whether they are the maximizing player in the game logic.
 * @class
 *
 * @property {string} id - The unique identifier for the player.
 * @property {boolean} isMaximizing - Indicates if the player is the maximizing player in the game logic.
 * @property {boolean} turn - Indicates if it is currently this player's turn.
 * @property {boolean} lastHorizontal - Indicates if the player's last move was horizontal.
 * @property {number} safetyTower - Indicates the number of owning towers the player has brought back to safety.
 * @property {Object} vault - The vault object containing the player's and opponent's vault values.
 * @property {boolean} winner - Player has won the game?
 *
 * @constructor
 * @param {string} id - The unique identifier for the player, must be one of the values in PLAYER_ID (e.g., 'user' or 'bot').
 * @param {boolean} [isMaximizing=false] - Indicates if the player is the maximizing player in the game logic.
 * @param {boolean} [turn=false] - Indicates if it is currently this player's turn.
 * @param {boolean} [lastHorizontal=false] - Indicates if the player's last move was horizontal.
 * @param {number} [safetyTower=0] - Indicates the number of owning towers the player has brought back to safety.
 * @param {Object} [vault={ ...NEW_VAULT }] - The vault object containing the player's and opponent's vault values.
 * @param {boolean} [winner=false]
 *
 * @throws {Error} Throws an error if the provided id is not a valid player identifier.
 */
class Player {
  /**
   * Unique identifier for the player, must be one of the values in PLAYER_ID (e.g., 'user' or 'bot').
   * @private
   * @type {string}
   * @readonly
   */
  _id;

  /**
   * Indicates if the player is the maximizing player in the game logic.
   * @private
   * @type {boolean}
   * @readonly
   */
  _isMaximizing;

  /**
   * Indicates if it is currently this player's turn.
   * @private
   * @type {boolean}
   */
  _turn;

  /**
   * Indicates if the player's last move was horizontal.
   * @private
   * @type {boolean}
   */
  _lastHorizontal;

  /**
   * Number of towers brought back to the safety zone by this player.
   * @private
   * @type {number}
   */
  _safetyTower;

  /**
   * The vault object containing the player's and opponent's vault values.
   * @private
   * @type {Object}
   */
  _vault;

  /**
   * Indicates if the player has won the current game.
   * @private
   * @type {boolean}
   */
  _winner;

  /**
   * Deserializes a plain object sent to the web worker and returns
   * the corresponding Player instance.
   * @static
   * @param {Object} object - The serialized plain javascript object sent to the web worker.
   * @returns {Player}}
   */
  static createFromStructuredClone(playerPlain) {
    return new Player(
      playerPlain._id,
      playerPlain._isMaximizing,
      playerPlain._turn,
      playerPlain._lastHorizontal,
      playerPlain._safetyTower,
      { ...playerPlain._vault },
      playerPlain._winner
    );
  }

  /**
   * @constructor
   * @param {string} id
   * @param {boolean} isMaximizing
   * @param {boolean} turn
   * @param {boolean} lastHorizontal
   * @param {number} safetyTower
   * @param {Object} vault
   */
  constructor(
    id,
    isMaximizing = false,
    turn = false,
    lastHorizontal = false,
    safetyTower = 0,
    vault = { ...NEW_VAULT },
    winner = false
  ) {
    if (typeof id !== "string" || !Object.values(PLAYER_ID).includes(id)) {
      throw new Error("Player Id may only be 'user' or 'bot'");
    }
    this._id = id;
    this._isMaximizing = isMaximizing;
    this._turn = turn;
    this._lastHorizontal = lastHorizontal;
    this._safetyTower = safetyTower;
    const selfVal = vault.self;
    const opponentVal = vault.opponent;
    this._vault = { self: selfVal, opponent: opponentVal };
    this._winner = winner;
  }

  /**
   * Gets the id of the player.
   * @public
   * @type {number}
   * @returns {number}
   * @readonly
   */
  get id() {
    return this._id;
  }

  /**
   * Gets a flag indicating whether this is a maximizing player.
   * @public
   * @type {boolean}
   * @returns {boolean}
   * @readonly
   */
  get isMaximizing() {
    return this._isMaximizing;
  }

  /**
   * Gets this players's turn information
   * @public
   * @type {boolean}
   * @returns {boolean}
   * @readonly
   */
  get turn() {
    return this._turn;
  }

  /**
   * Sets this players's turn information
   * @public
   * @param {boolean} value
   */
  set turn(value) {
    this._turn = value;
  }

  /**
   * Gets a flag indicating whether this player is allowed to move horizontally.
   * If the current move is done horizontally, it will be disallowed for this players's next move only.
   * @public
   * @type {boolean}
   * @returns {boolean}
   * @readonly
   */
  get lastHorizontal() {
    return this._lastHorizontal;
  }

  /**
   * Sets a flag indicating whether this player is allowed to move horizontally.
   * If the current move is done horizontally, it will be disallowed for this players's next move only.
   * @public
   * @param {boolean} value
   */
  set lastHorizontal(value) {
    this._lastHorizontal = value;
  }

  /**
   * Gets the number of towers brought back to the safety zone by this player.
   * @public
   * @type {number}
   * @returns {number}
   * @readonly
   */
  get safetyTower() {
    return this._safetyTower;
  }

  /**
   * Sets the number of towers brought back to the safety zone by this player.
   * @public
   * @param {boolean} value
   */
  set safetyTower(value) {
    this._safetyTower = Math.min(6, value);
  }

  /**
   * Gets the player's vault. Holds the information of all conquered self and opponent stones
   * resulted from a specific movement and conquering of an opponent's tower.
   * @public
   * @type {Object}
   * @returns {Object}
   * @readonly
   */
  get vault() {
    return this._vault;
  }

  /**
   * Sets the player's vault. Holds the information of all conquered self and opponent stones
   * resulted from a specific movement and conquering of an opponent's tower.
   * @public
   * @param {Object} value
   */
  set vault(value) {
    this._vault.self = Math.min(6, value.self);
    this._vault.opponent = Math.min(6, value.opponent);
  }

  /**
   * Gets a flag indicating whether this player has won the current game.
   * @public
   * @type {boolean}
   * @returns {boolean}
   * @readonly
   */
  get winner() {
    return this._winner;
  }
  /**
   * Sets a flag indicating whether this player has won the current game.
   * @public
   * @param {boolean} value
   */
  set winner(value) {
    this._winner = value;
  }

  /**
   * Returns a new deep copied instance.
   * This creation is necessary in order to restore the BoardState during the recursive
   * game search tree traversal of the minimax Alpha-Beta-Pruning algorithm.
   * @returns {Player} - the new deep copied instance
   */
  cloneInstance() {
    return new Player(
      this._id,
      this._isMaximizing,
      this._turn,
      this._lastHorizontal,
      this._safetyTower,
      { ...this._vault },
      this._winner
    );
  }
}

/**
 * Represents the state of both players in the game.
 * @class
 * @property {Player[]} twoPlayer - The array of Player instances representing the two players in the game.
 * @constructor
 * @param {Player[]} twoPlayer - An array of Player instances representing the two players in the game.
 */
class PlayerState {
  /**
   * An array of Player instances representing the two players in the game.
   * @private
   * @type {Player[]}
   * @readonly
   */
  _twoPlayer;

  /**
   * Deserializes a plain object sent to the web worker and returns
   * the corresponding PlayerState instance.
   * @static
   * @param {Object} object - The serialized plain javascript object sent to the web worker.
   * @returns {PlayerState}}
   */
  static createFromStructuredClone(playerStatePlain) {
    const newTwoPlayer = [];
    playerStatePlain._twoPlayer.forEach((playerPlain) => {
      newTwoPlayer.push(Player.createFromStructuredClone(playerPlain));
    });
    return new PlayerState(newTwoPlayer);
  }

  /**
   * @constructor
   * @param {Player[]} twoPlayer
   */
  constructor(twoPlayer) {
    this._twoPlayer = twoPlayer;
  }

  /**
   * Gets the current state of both players.
   * @public
   * @type {Player[]}
   * @returns {Player[]}
   * @readonly
   */
  get twoPlayer() {
    return this._twoPlayer;
  }

  /**
   * Returns a new deep copied instance.
   * This creation is necessary in order to restore the BoardState during the recursive
   * game search tree traversal of the minimax Alpha-Beta-Pruning algorithm.
   * @returns {PlayerState} - the new deep copied instance
   */
  cloneInstance() {
    const newTwoPlayer = [];
    this._twoPlayer.forEach((player) =>
      newTwoPlayer.push(player.cloneInstance())
    );
    return new PlayerState(newTwoPlayer);
  }
}

/**
 * Represents a move in the game, including the source cell, target cell, and the player's state.
 *
 * @class
 * @property {GridCell} srcCell - The source cell of the move.
 * @property {GridCell} tgtCell - The target cell of the move.
 * @property {PlayerState} playerState - The state of both players before making the move.
 * @constructor
 * @param {GridCell} srcCell - The source cell of the move.
 * @param {GridCell} tgtCell - The target cell of the move.
 * @param {PlayerState} playerState - The state of the player making the move.
 */
class Move {
  /**
   * The source cell of the move.
   * @private
   * @type {GridCell}
   * @readonly
   */
  _srcCell;

  /**
   * The target cell of the move.
   * @private
   * @type {GridCell}
   * @readonly
   */
  _tgtCell;

  /**
   * The state of the player making the move.
   * @private
   * @type {PlayerState}
   * @readonly
   */
  _playerState;

  /**
   * Creates a new Move instance.
   * @constructor
   * @param {GridCell} srcCell - The source cell of the move.
   * @param {GridCell} tgtCell - The target cell of the move.
   * @param {PlayerState} playerState - The state of the player making the move.
   */
  constructor(srcCell, tgtCell, playerState) {
    this._srcCell = srcCell;
    this._tgtCell = tgtCell;
    this._playerState = playerState;
  }

  /**
   * Gets the source GridCell instance for this move.
   * @public
   * @type {GridCell}
   * @returns {GridCell}
   * @readonly
   */
  get srcCell() {
    return this._srcCell;
  }

  /**
   * Gets the target GridCell instance for this move.
   * @public
   * @type {GridCell}
   * @returns {GridCell}
   * @readonly
   */
  get tgtCell() {
    return this._tgtCell;
  }
  /**
   * Gets the state of both players for this move.
   * @public
   * @type {PlayerState}
   * @returns {PlayerState}
   * @readonly
   */
  get playerState() {
    return this._playerState;
  }

  /**
   * Returns a new deep copied instance without any DOM relations.
   * @returns {Move} - the new deep copied instance
   */
  cloneInstance() {
    return new Move(
      this._srcCell.cloneInstance(),
      this._tgtCell.cloneInstance(),
      this._playerState.cloneInstance()
    );
  }
}

/**
 * Represents a html sidebar including svg icons reflecting the current player's state graphically.
 *
 * @class
 * @property {Player} player - The player instance for this sidebar.
 * @property {HTMLDivElement} container - The html anchor element for this sidebar.
 * @property {HTMLDivElement} walletId - The html child element for the player's wallet id.
 * @property {HTMLDivElement} horizontalMove - The html child element indicating the users's lock state for horizontal movement.
 * @property {SVGSVGElement} svgHorizontalMove - The svg child element icon indicating the users's lock state for horizontal movement.
 * @property {HTMLDivElement} horizontalMoveLeft - The html child element indicating the users's lock state for horizontal movement.
 * @property {SVGSVGElement} svgHorizontalMoveLeft - The svg child element icon indicating the users's lock state for horizontal movement.
 * @property {HTMLDivElement} horizontalMoveRight - The html child element indicating the users's lock state for horizontal movement.
 * @property {SVGSVGElement} svgHorizontalMoveRight - The svg child element icon indicating the users's lock state for horizontal movement.
 * @property {HTMLDivElement} safetyTile - The html child element for the background icon of safety tower information.
 * @property {HTMLDivElement} safetyDigit - The html child element containing all svg icons representing a digit for the number of safety towers.
 * @property {HTMLDivElement} vaultTile - The html child element for the background of the player's vault.
 * @property {HTMLDivElement} vaultOpponent - The html element for the svg representing an opponents stone.
 * @property {HTMLDivElement} vaultDigit - The html child element containing all svg icons representing a digit for the number of conquered stones.
 *
 * @throws {TypeError} - On invalid parameter types.
 * @constructor
 * @param {Player} player - The player instance for this sidebar
 * @param {HTMLDivElement} container - The parent container or anchor html element.
 */
class Sidebar {
  /**
   * The player instance for this sidebar dashboard.
   * @private
   * @type {Player}
   * @readonly
   */
  _player;

  /**
   * The parent container html element and sidebar anchor.
   * @private
   * @type {HTMLDivElement}
   * @readonly
   */
  _container;

  /**
   * Flag indicating whether this sidebar is located in the hsitory board for game replay.
   * @private
   * @type {boolean}
   * @readonly
   */
  _history;

  /**
   * The html child element for the player's theme background.
   * @private
   * @type {HTMLDivElement}
   * @readonly
   */
  _walletId;

  /**
   * The html child element indicating the users's lock state for horizontal movement.
   * @private
   * @type {HTMLDivElement}
   * @readonly
   */
  _horizontalMove;

  /**
   * The html child element icon indicating the users's lock state for horizontal movement.
   * @private
   * @type {SVGSVGElement}
   * @readonly
   */
  _svgHorizontalMove;

  /**
   * The html child element indicating the users's lock state for horizontal movement.
   * @private
   * @type {HTMLDivElement}
   * @readonly
   */
  _horizontalMoveLeft;

  /**
   * The html child element icon indicating the users's lock state for horizontal movement.
   * @private
   * @type {SVGSVGElement}
   * @readonly
   */
  _svgHorizontalMoveLeft;

  /**
   * The html child element indicating the users's lock state for horizontal movement.
   * @private
   * @type {HTMLDivElement}
   * @readonly
   */
  _horizontalMoveRight;

  /**
   * The html child element icon indicating the users's lock state for horizontal movement.
   * @private
   * @type {SVGSVGElement}
   * @readonly
   */
  _svgHorizontalMoveRight;

  /**
   * The html child element for the background icon of safety tower information.
   * @private
   * @type {HTMLDivElement}
   * @readonly
   */
  _safetyTile;

  /**
   * The html child element containing all svg icons representing a digit for the number of towers brought back to safety.
   * @private
   * @type {HTMLDivElement}
   * @readonly
   */
  _safetyDigit;

  /**
   * The html child element for the background of the player's vault.
   * @private
   * @type {HTMLDivElement}
   * @readonly
   */
  _vaultTile;

  /**
   * The html element for the svg representing an opponents stone.
   * @private
   * @type {HTMLDivElement}
   * @readonly
   */
  _vaultOpponent;

  /**
   * The html child element containing all svg icons representing a digit for the number of conquered stones.
   * @private
   * @type {HTMLDivElement}
   * @readonly
   */
  _vaultDigit;

  /**
   * The html child element containing the hand pointer up icon for marking the current active player.
   * @private
   * @type {HTMLDivElement}
   * @readonly
   */
  _handPointer;

  /**
   * A WeakMap mapping the player instance for the live game sidebars.
   * @static
   * @type {WeakMap<Player, Sidebar>|null}
   */
  static playerMap = new WeakMap();

  /**
   * A WeakMap mapping the player instance for the history board sidebars.
   * @static
   * @type {WeakMap<Player, Sidebar>|null}
   */
  static playerMapHistory = new WeakMap();
  /**
   * Creates a new GridCell instance.
   * @constructor
   * @param {Player} player - The player instance for this sidebar
   * @param {HTMLDivElement} container - The parent container or anchor html element.
   * @throws {TypeError} - On invalid parameter types.
   * @throws {Error} - On invalid div child elements.
   */
  constructor(player, container, history) {
    if (!(player instanceof Player) || !(container instanceof HTMLDivElement)) {
      throw new Error("invalid parms");
    }
    this._player = player;
    this._container = container;
    this._history = history;
    Array.from(container.children).forEach((divElem) => {
      if (!(divElem instanceof HTMLDivElement)) {
        throw new Error("invalid parameter");
      }
      Array.from(divElem.classList).forEach((name) => {
        switch (name) {
          case "walletId":
            this._walletId = divElem;
            break;
          case "horizontalMove":
            this._horizontalMove = divElem;
            break;
          case "horizontalMoveLeft":
            this._horizontalMoveLeft = divElem;
            break;
          case "horizontalMoveRight":
            this._horizontalMoveRight = divElem;
            break;
          case "safetyTile":
            this._safetyTile = divElem;
            break;
          case "safetyDigit":
            this._safetyDigit = divElem;
            break;
          case "vaultTile":
            this._vaultTile = divElem;
            break;
          case "vaultOpponent":
            this._vaultOpponent = divElem;
            break;
          case "vaultDigit":
            this._vaultDigit = divElem;
            break;
          case "handPointer":
            this._handPointer = divElem;
        }
      });
    });
    if (
      !this._walletId ||
      !this._safetyTile ||
      !this._safetyDigit ||
      !this._vaultTile ||
      !this._vaultOpponent ||
      !this._vaultDigit ||
      !this._handPointer
    ) {
      throw new Error("invalid div element for sidebar");
    }
    this._svgHorizontalMove = this._horizontalMove.querySelector("svg");
    this._svgHorizontalMoveLeft = this._horizontalMoveLeft.querySelector("svg");
    this._svgHorizontalMoveRight =
      this._horizontalMoveRight.querySelector("svg");
    if (
      !this._svgHorizontalMove ||
      !this._svgHorizontalMoveLeft ||
      !this._svgHorizontalMoveRight
    ) {
      throw new Error("invalid svg element for sidebar");
    }
    if (history) {
      Sidebar.playerMapHistory.set(this._player, this);
    } else {
      Sidebar.playerMap.set(this._player, this);
    }
  }

  /**
   * Mark the active player's sidebar with a hand pointer icon placed at the footer.
   *
   * @returns {void}
   */
  markDashboard() {
    this._handPointer.querySelector("svg").classList.remove("svgHide");
  }

  /**
   * Unmark the active player's sidebar.
   *
   * @returns {void}
   */
  unmarkDashboard() {
    this._handPointer.querySelector("svg").classList.add("svgHide");
  }

  /**
   * Updates the current player state in this html sidebar.
   *
   * @returns {void}
   */
  refreshDashboard() {
    this._vaultDigit
      .querySelector("svg > use")
      .setAttribute(
        "href",
        `./images/icons.svg#icon_digit_${this._player.vault.opponent}`
      );

    this._safetyDigit
      .querySelector("svg > use")
      .setAttribute(
        "href",
        `./images/icons.svg#icon_digit_${this._player.safetyTower}`
      );

    if (this._player.lastHorizontal === true) {
      this._svgHorizontalMove.classList.remove("svgHide");
      this._svgHorizontalMoveLeft.classList.remove("iconDigit");
      this._svgHorizontalMoveLeft.classList.add("filterGray");
      this._svgHorizontalMoveRight.classList.remove("iconDigit");
      this._svgHorizontalMoveRight.classList.add("filterGray");
    } else {
      this._svgHorizontalMove.classList.add("svgHide");
      this._svgHorizontalMoveLeft.classList.remove("filterGray");
      this._svgHorizontalMoveLeft.classList.add("iconDigit");
      this._svgHorizontalMoveRight.classList.remove("filterGray");
      this._svgHorizontalMoveRight.classList.add("iconDigit");
    }

    if (this._player.winner === true) {
      this._horizontalMove.classList.add("winnerSidebar");
      this._safetyTile.classList.add("winnerSidebar");
      this._vaultTile.classList.add("winnerSidebar");
    } else {
      this._horizontalMove.classList.remove("winnerSidebar");
      this._safetyTile.classList.remove("winnerSidebar");
      this._vaultTile.classList.remove("winnerSidebar");
    }
  }
}

export { PLAYER_ID, GridCell, BoardState, Player, PlayerState, Move, Sidebar };
