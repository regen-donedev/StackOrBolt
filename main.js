/**
 * @module main
 * @description This main module is the primary entry point when the web page is served and the DOM content is loaded.
 * It initializes the game board, sets up event handlers for user interactions,
 * and manages the GameState including player turns and move execution.
 * It also handles the interaction with the spawned Web Worker for AI moves.
 * It utilizes the GameState for managing all game state data,
 * the GameLogic for core game rules and moves,
 * and the MinimaxAB module for AI decision-making.
 * @requires module:GameState
 * @requires module:AsyncAPIWrapper
 * @requires module:ConfigState
 * @requires module:GameEventLoop
 * @requires module:Logger
 * @requires module:ReplayHistoryEventLoop
 * @requires module:ErrorUtils
 */
import { handleErrorEvent } from "./modules/ErrorUtils.js";
import {
  GridCell,
  BoardState,
  Player,
  PlayerState,
  PLAYER_ID,
  Sidebar,
} from "./modules/GameState.js";
import {
  dispatchWorker,
  workerMessageScheme,
} from "./modules/AsyncAPIWrapper.js";
import { Settings } from "./modules/ConfigState.js";
import {
  handleHoveredCellIn,
  handleHoveredCellOut,
  prepareMoveForCell,
  discardMoveForCell,
  playUserMove,
  resetGame,
} from "./modules/GameEventLoop.js";
import {
  LoggerWriter,
  LoggerReader,
  cacheAllIndexKeys,
  cacheKeysFromIndex,
} from "./modules/Logger.js";
import {
  loadGameHistoryMove,
  autoPlayTerminate,
  autoPlayManager,
  updateSvg,
  dialogGameReplaySelectionHandler,
  dialogReplayCurrentGameStateHandler,
  dialogNoHistoryDataFoundHandler,
  dialogInvalidStateForReplayHandler,
} from "./modules/ReplayHistoryEventLoop.js";

let aiWorker;
let dbWorker;
let isFatalError = false;

/**
 * Force CSS color-scheme selection because of iOS user agent issues for imbedded svg shado root content.
 * @returns {void}
 */
function forceCSSColorSchemeSelection() {
  const radioThemeLight = document.querySelector(
    "#sectHome input.radioThemeLight"
  );
  const radioThemeDark = document.querySelector(
    "#sectHome input.radioThemeDark"
  );
  if (window.matchMedia("(prefers-color-scheme : light)").matches === true) {
    radioThemeLight.checked = true;
  } else {
    radioThemeDark.checked = true;
  }
}

/**
 * Creates a game board by generating a grid of cells, initializing their state,
 * and appending them to the provided board element. Also sets up initial player positions.
 *
 * @param {HTMLElement} board - The CSS grid container DOM element to which the cells will be appended.
 * @returns {BoardState} The initialized board state containing all cells.
 * @throws {Error} If the parameters is invalid.
 */
function createBoard(domBoard) {
  const cells = [];
  const svg1 = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg1.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  svg1.setAttribute("viewBox", "0 0 100 100");
  svg1.classList.add(
    "fillColorUser2",
    "fillColorBot2",
    "fillColorDot",
    "strokeColor"
  );
  const use1 = document.createElementNS("http://www.w3.org/2000/svg", "use");
  use1.setAttribute("href", "./images/pieces.svg#tower_none");
  svg1.appendChild(use1);

  Array.from(domBoard.children).forEach((domCell, index) => {
    domCell.appendChild(svg1.cloneNode(true));
    const column = index % 6;
    const row = Math.round((index - column) / 6);
    const cell = new GridCell(row, column, true, domCell);
    cells.push(cell);
  });
  const domBoardState = new BoardState(
    cells,
    createPlayer(),
    true,
    false,
    false
  );
  domBoardState.cells
    .filter((cell) => cell.row === 0)
    .forEach((cell) => {
      cell.svgLayout.push(PLAYER_ID.USER);
      cell.direction = 1;
      cell.updateSvg();
    });
  domBoardState.cells
    .filter((cell) => cell.row === 1)
    .forEach((cell) => {
      cell.svgLayout.push(PLAYER_ID.USER);
      cell.direction = 1;
      cell.updateSvg();
    });
  domBoardState.cells
    .filter((cell) => cell.row === 6 - 1)
    .forEach((cell) => {
      cell.svgLayout.push(PLAYER_ID.BOT);
      cell.direction = -1;
      cell.updateSvg();
    });
  domBoardState.cells
    .filter((cell) => cell.row === 6 - 2)
    .forEach((cell) => {
      cell.svgLayout.push(PLAYER_ID.BOT);
      cell.direction = -1;
      cell.updateSvg();
    });
  return domBoardState;
}

/**
 * Creates a game board by generating a grid of cells, initializing their state,
 * and appending them to the provided board element. Also sets up initial player positions.
 *
 * @param {HTMLElement} board - The CSS grid container DOM element to which the cells will be appended.
 * @returns {BoardState} The initialized board state containing all cells.
 * @throws {Error} If the parameters is invalid.
 */
function createHistoryBoard(domBoardState) {
  const historyBoard = document.querySelector("#sectReplayLogger .board");
  const svg1 = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg1.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  svg1.setAttribute("viewBox", "0 0 100 100");
  svg1.classList.add(
    "fillColorUser2",
    "fillColorBot2",
    "fillColorDot",
    "strokeColor"
  );
  const use1 = document.createElementNS("http://www.w3.org/2000/svg", "use");
  use1.setAttribute("href", "./images/pieces.svg#tower_none");
  svg1.appendChild(use1);

  Array.from(historyBoard.children).forEach((domCell, index) => {
    domCell.appendChild(svg1.cloneNode(true));
  });
  Array.from(historyBoard.children).forEach((domCell, index) => {
    const domBoardCell = domBoardState.cells[index];
    updateSvg(domCell, domBoardCell.svgLayout, domBoardCell.dot);
  });
  return historyBoard;
}

/**
 * Creates a sidebar for a player on the left or right hand side of the bord. This sidebar reflects graphically the current
 * player's game state.
 *
 * @param {Player} player - The player for that this sidebar is created.
 * @param {HTMLDivElement|null} - The anchor html element containing this sidebar.
 * @returns {Promise<void>}
 *
 */
function createSidebar(player, anchor, history) {
  const sidebar = new Sidebar(player, anchor, history);
}

/**
 * Creates and returns a new PlayerState instance with both players:
 * one player (active, not AI) and one player (inactive, AI).
 *
 * @returns {PlayerState} The initialized PlayerState containing two players.
 */
function createPlayer() {
  const twoPlayer = [];
  twoPlayer.push(new Player(PLAYER_ID.BOT, true, false));
  twoPlayer.push(new Player(PLAYER_ID.USER, false, true));
  const playerState = new PlayerState(twoPlayer);
  return playerState;
}

/**
 * Initializes event handlers for the game board, enabling interactive cell selection,
 * highlighting, and move execution for both (player and bot).
 *
 * @param {HTMLElement} domBoard - The DOM element representing the game board.
 * @param {BoardState} domBoardState - The initialized board state containing all cells and player information.
 * @param {Worker} aiWorker - The spawned Web Worker instance that handles AI logic.
 * @returns {void}
 */
function initBoardEventHandlers(
  domBoard,
  domBoardState,
  settings,
  loggerWriter
) {
  domBoard.addEventListener("mouseover", (event) => {
    try {
      if (isFatalError) {
        return;
      }
      const currentPlayer = domBoardState.playerState.twoPlayer.find(
        (player) => player.turn === true
      );
      let hoveredCell = domBoardState.mapDomElement.get(
        event.target.closest(".boardCell")
      );
      hoveredCell ??= null;
      if (
        domBoardState.disableBoardEvents === true ||
        hoveredCell === null ||
        !hoveredCell instanceof GridCell ||
        hoveredCell.svgLayout.length === 0 ||
        hoveredCell.svgLayout.at(-1) !== currentPlayer.id ||
        hoveredCell.domEl.classList.contains("select")
      ) {
        return;
      }
      handleHoveredCellIn(hoveredCell, domBoardState, currentPlayer);
    } catch (error) {
      handleErrorEvent(error);
      throw new Error(error);
    }
  });

  domBoard.addEventListener("mouseout", (event) => {
    try {
      if (isFatalError) {
        return;
      }
      const currentPlayer = domBoardState.playerState.twoPlayer.find(
        (player) => player.turn === true
      );
      let hoveredCell = domBoardState.mapDomElement.get(
        event.target.closest(".boardCell")
      );
      hoveredCell ??= null;
      if (
        domBoardState.disableBoardEvents === true ||
        hoveredCell === null ||
        !hoveredCell instanceof GridCell ||
        hoveredCell.svgLayout.length === 0 ||
        hoveredCell.svgLayout.at(-1) !== currentPlayer.id
      ) {
        return;
      }
      handleHoveredCellOut();
    } catch (error) {
      handleErrorEvent(error);
      throw new Error(error);
    }
  });

  domBoard.addEventListener("click", async (event) => {
    try {
      if (isFatalError) {
        return;
      }
      // Return if this event is not fired for playing a new move
      let clickedCell = domBoardState.mapDomElement.get(
        event.target.closest(".boardCell")
      );
      clickedCell ??= null;
      if (
        domBoardState.disableBoardEvents === true ||
        clickedCell === null ||
        !clickedCell instanceof GridCell ||
        prepareMoveForCell(clickedCell) === true ||
        discardMoveForCell(clickedCell) === true ||
        !clickedCell.domEl.classList.contains("click")
      ) {
        return;
      }
      await playUserMove(
        domBoardState,
        settings,
        aiWorker,
        loggerWriter,
        clickedCell
      );
    } catch (error) {
      handleErrorEvent(error);
      throw new Error(error);
    }
  });
}

/**
 * Initializes event handlers for the game board, enabling interactive cell selection,
 * highlighting, and move execution for both (player and bot).
 *
 * @param {HTMLDivElement} navbar - The DOM element representing the navigation bar above the game board.
 * @returns {void}
 */
function initNavbarEventHandlers(domBoardState, loggerWriter, navbar) {
  navbar.addEventListener("click", async (event) => {
    try {
      if (isFatalError) {
        return;
      }
      let clickedCell = event.target.closest("div");
      clickedCell ??= null;
      if (
        domBoardState.waitForWebWorker === true ||
        clickedCell === null ||
        !clickedCell instanceof HTMLDivElement ||
        (!clickedCell.classList.contains("navbarRestart") &&
          !clickedCell.classList.contains("navbarSettings") &&
          !clickedCell.classList.contains("navbarDatabase"))
      ) {
        return;
      }
      for (const className of clickedCell.classList) {
        switch (className) {
          case "navbarRestart":
            resetGame(domBoardState, loggerWriter);
            break;
          case "navbarSettings":
            window.location.hash = "#sectSettings";
            break;
          case "navbarDatabase":
            if (LoggerReader.instances.size > 0) {
              LoggerReader.currentSelectedInstance = LoggerReader.instances
                .entries()
                .toArray()
                .at(-1)[1];
              await loadGameHistoryMove(Infinity);
            }
            window.location.hash = "#sectReplayLogger";
            break;
          default:
            break;
        }
      }
    } catch (error) {
      handleErrorEvent(error);
      throw new Error(error);
    }
  });
}

/**
 * Initializes all input range values from the Settings object store in the database.
 * @param {Array<HTMLInputElement>} inputs - All html input range elements from the settings section
 * @param {Array<HTMLOutputElement>} outputs - All html output elements from the settings section
 * @returns {void}
 */
function initRangeSlidersFromDb(settings, inputs, outputs) {
  inputs.forEach((input, index) => {
    switch (input.id) {
      case "safetyTowers":
        input.value = String(settings.winningRules.settings.safetyZone);
        break;
      case "opponentStones":
        input.value = String(settings.winningRules.settings.materialOpponent);
        break;
      case "maxStackSize":
        input.value = String(settings.winningRules.settings.maxStackSize);
        break;
      case "searchDepth":
        input.value = String(settings.searchRules.settings.depth);
        break;
      case "searchTimeout":
        input.value = String(settings.searchRules.settings.timeout);
        break;
      case "materialAdvantageConquered":
        input.value = String(
          settings.materialAdvantageConquered.settings.totalWeight
        );
        break;
      case "materialAdvantageOpponentWeight":
        input.value = String(
          settings.materialAdvantageConquered.settings.opponentWeight
        );
        break;
      case "safetyZone1":
        input.value = String(
          settings.safetyZoneProximity.settings.weightRowDistance1
        );
        break;
      case "safetyZone2":
        input.value = String(
          settings.safetyZoneProximity.settings.weightRowDistance2
        );
        break;
      case "safetyZone3":
        input.value = String(
          settings.safetyZoneProximity.settings.weightRowDistance3
        );
        break;
      case "safetyZone4":
        input.value = String(
          settings.safetyZoneProximity.settings.weightRowDistance4
        );
        break;
      case "safetyZone5":
        input.value = String(
          settings.safetyZoneProximity.settings.weightRowDistance5
        );
        break;
      case "safetyZoneTotalDistanceWeight":
        input.value = String(
          settings.safetyZoneProximity.settings.safetyZoneTotalDistance
        );
        break;
      case "safetyZoneOpponentWeight":
        input.value = String(
          settings.safetyZoneProximity.settings.opponentWeight
        );
        break;
      case "safetyZoneTotalWeight":
        input.value = String(settings.safetyZoneProximity.settings.totalWeight);
        break;
      case "materialAdvantageAccounted":
        input.value = String(
          settings.materialAdvantageAccounted.settings.totalWeight
        );
        break;
      default:
        throw new Error("unknown input element");
    }
    outputs.at(index).textContent = input.value;
  });
}

/**
 * Saves current configuration to the Settings object store in the database.
 * @param {Array<HTMLInputElement>} domInputs - All html input range elements from the settings section
 * @param {Settings} dbSettings - The current instance of class Settings reflecting the live configuration.
 * @returns {void}
 */
async function saveCurrentSettings(domInputs, dbSettings) {
  const newWinningRules = structuredClone(Settings.factoryWinningRules);
  const newSearchRules = structuredClone(Settings.factorySearchRules);
  const newMaterialAdvantageConquered = structuredClone(
    Settings.factoryMaterialAdvantageConquered
  );
  const newSafetyZoneProximity = structuredClone(
    Settings.factorySafetyZoneProximity
  );
  const newMaterialAdvantageAccounted = structuredClone(
    Settings.factoryMaterialAdvantageAccounted
  );
  domInputs.forEach((input, _) => {
    switch (input.id) {
      case "safetyTowers":
        newWinningRules.settings.safetyZone = Number(input.value);
        break;
      case "opponentStones":
        newWinningRules.settings.materialOpponent = Number(input.value);
        break;
      case "maxStackSize":
        newWinningRules.settings.maxStackSize = Number(input.value);
        break;
      case "searchDepth":
        newSearchRules.settings.depth = Number(input.value);
        break;
      case "searchTimeout":
        newSearchRules.settings.timeout = Number(input.value);
        break;
      case "materialAdvantageConquered":
        newMaterialAdvantageConquered.settings.totalWeight = Number(
          input.value
        );
        break;
      case "materialAdvantageOpponentWeight":
        newMaterialAdvantageConquered.settings.opponentWeight = parseFloat(
          input.value
        );
        break;
      case "safetyZone1":
        newSafetyZoneProximity.settings.weightRowDistance1 = Number(
          input.value
        );
        break;
      case "safetyZone2":
        newSafetyZoneProximity.settings.weightRowDistance2 = Number(
          input.value
        );
        break;
      case "safetyZone3":
        newSafetyZoneProximity.settings.weightRowDistance3 = Number(
          input.value
        );
        break;
      case "safetyZone4":
        newSafetyZoneProximity.settings.weightRowDistance4 = Number(
          input.value
        );
        break;
      case "safetyZone5":
        newSafetyZoneProximity.settings.weightRowDistance5 = Number(
          input.value
        );
        break;
      case "safetyZoneTotalDistanceWeight":
        newSafetyZoneProximity.settings.safetyZoneTotalDistance = Number(
          input.value
        );
      case "safetyZoneOpponentWeight":
        newSafetyZoneProximity.settings.opponentWeight = parseFloat(
          input.value
        );
        break;
      case "safetyZoneTotalWeight":
        newSafetyZoneProximity.settings.totalWeight = Number(input.value);
        break;
      case "materialAdvantageAccounted":
        newMaterialAdvantageAccounted.settings.totalWeight = Number(
          input.value
        );
        break;
      default:
        throw new Error("unknown input element");
    }
  });
  dbSettings.winningRules = newWinningRules;
  dbSettings.searchRules = newSearchRules;
  dbSettings.materialAdvantageConquered = newMaterialAdvantageConquered;
  dbSettings.safetyZoneProximity = newSafetyZoneProximity;
  dbSettings.materialAdvantageAccounted = newMaterialAdvantageAccounted;
  await dbSettings.save();
}

/**
 * This function:
 * - Initially loads the persistent settings from the database and updates all input values.
 * - Adds an event handler delegator for the input event inside this html section.
 * This event handler simply updates the text context of the output element,
 * whenver the input value changes for a specific range slider.
 * - Adds an event handler delegator for the click event inside this hmtl section.
 * By clicking on the save icon, the properties of the settings instance are updated and
 * all input values are saved to the database.
 * By clicking on the recycle icon, the factory defualt settings are restored
 * for the database and all properties of the settings instance.
 *
 * @param {Settings} settings - The Worker instance handling the db operations.
 * @returns {void}
 */
function initSettingsEventHandlers(settings) {
  const domSettings = document.getElementById("sectSettings");
  const dialogSave = domSettings.querySelector(".dialogSettingsSave");
  const dialogSaveCancel = dialogSave.querySelector(".iconCancel");
  const dialogSaveConfirm = dialogSave.querySelector(".iconConfirm");
  const dialogRecycle = domSettings.querySelector(".dialogSettingsRecycle");
  const dialogRecycleCancel = dialogRecycle.querySelector(".iconCancel");
  const dialogRecycleConfirm = dialogRecycle.querySelector(".iconConfirm");
  const inputs = Array.from(domSettings.getElementsByTagName("input"));
  const outputs = Array.from(domSettings.getElementsByTagName("output"));
  initRangeSlidersFromDb(settings, inputs, outputs);
  dialogSaveCancel.addEventListener("click", (event) => {
    try {
      if (isFatalError) {
        return;
      }
      dialogSave.close();
    } catch (error) {
      handleErrorEvent(error);
      throw new Error(error);
    }
  });
  dialogSaveConfirm.addEventListener("click", async (event) => {
    try {
      if (isFatalError) {
        return;
      }
      await saveCurrentSettings(
        Array.from(domSettings.getElementsByTagName("input")),
        settings
      );
      dialogSave.close();
    } catch (error) {
      handleErrorEvent(error);
      throw new Error(error);
    }
  });
  dialogRecycleCancel.addEventListener("click", (event) => {
    try {
      if (isFatalError) {
        return;
      }
      dialogRecycle.close();
    } catch (error) {
      handleErrorEvent(error);
      throw new Error(error);
    }
  });
  dialogRecycleConfirm.addEventListener("click", async (event) => {
    try {
      if (isFatalError) {
        return;
      }
      await settings.restoreFactoryDefault();
      initRangeSlidersFromDb(settings, inputs, outputs);
      dialogRecycle.close();
    } catch (error) {
      handleErrorEvent(error);
      throw new Error(error);
    }
  });
  domSettings.addEventListener("input", (event) => {
    try {
      if (isFatalError) {
        return;
      }
      const form = event.target.closest(".panel");
      const inputs = Array.from(form.getElementsByTagName("input"));
      const outputs = Array.from(form.getElementsByTagName("output"));
      inputs.forEach((input, index) => {
        outputs.at(index).textContent = input.value;
      });
    } catch (error) {
      handleErrorEvent(error);
      throw new Error(error);
    }
  });
  domSettings.addEventListener("click", async (event) => {
    try {
      if (isFatalError) {
        return;
      }
      const navIcon = event.target.closest("svg");
      if (
        !navIcon ||
        (!navIcon.classList.contains("iconSave") &&
          !navIcon.classList.contains("iconRecycle"))
      ) {
        return;
      }
      if (navIcon.classList.contains("iconSave")) {
        dialogSave.showModal();
        return;
      }
      if (navIcon.classList.contains("iconRecycle")) {
        dialogRecycle.showModal();
        return;
      }
    } catch (error) {
      handleErrorEvent(error);
      throw new Error(error);
    }
  });
}

/**
 * Loads the game history key data from the database and stores this meta information
 * into the container items of the game replay dialog..
 * @returns {void}
 */
async function loadReplayLogger() {
  const allIndexKeys = await cacheAllIndexKeys();
  if (allIndexKeys) {
    for (const gameId of allIndexKeys) {
      const reader = new LoggerReader(gameId);
      const keys = await cacheKeysFromIndex(gameId);
      keys.forEach((key, _) => {
        reader.addPrimaryKey(key);
      });
      //update scroll container item content for the game history properties
      const lastLoggedMove = await reader.fetchRecord(Infinity);
      reader.move = lastLoggedMove.move;
      const bot = lastLoggedMove.boardState._playerState._twoPlayer.find(
        (player) => player._id === PLAYER_ID.BOT
      );
      const user = lastLoggedMove.boardState._playerState._twoPlayer.find(
        (player) => player._id === PLAYER_ID.USER
      );
      if (bot._winner === true) {
        reader.winner = PLAYER_ID.BOT;
      }
      if (user._winner === true) {
        reader.winner = PLAYER_ID.USER;
      }
      reader.updateScrollItemElements();
    }
  }
}

/**
 * Terminates and recreates the ai web worker thread on a timeout condition.
 * @returns {void}
 */
function reCreateAiWorker() {
  aiWorker.terminate();
  aiWorker = new Worker("./modules/AiWorker.js", { type: "module" });
}

/**
 * This function:
 * - Initially loads all game id index keys from the ReplayLogger object store
 *   and creates all corresponding LoggerReader instances.
 * - Adds an event handler delegator for the click event loop inside this hmtl section.
 *   By clicking on the footer buttons, the cursor state for the
 *   ReplayLogger object store is managed. The primary key for this current game history
 *   gets advanced correspondingly and the moves are replayed and printed.
 *   By clicking on the replay button on the top right, the current game is stopped and
 *   resetted and a new game is started at this specific user's move.
 * - By clicking on the upload button, a dialog is opened from where you can select another game history.
 * - By clicking on the replay icon in the navigation bar, the current live gamestate will be resetted
 *   and restored after the last forwarded bots move from the selected game history.
 * @returns {void}
 */
async function initReplayLoggerEventHandlers() {
  const domReplayLogger = document.getElementById("sectReplayLogger");
  const gameReplayScrollContainer = domReplayLogger.querySelector(
    ".navbarUploadModal .dialogUploadModal main"
  );
  if (!gameReplayScrollContainer) {
    throw new Error("cannot relocate scroll container for dialog element");
  }
  const containerConfirmCancelCommit = domReplayLogger.querySelector(
    ".dialogReplayCommit .containerConfirmCancel"
  );
  if (!containerConfirmCancelCommit) {
    throw new Error(
      "cannot relocate container element for replay commit confirmation"
    );
  }
  containerConfirmCancelCommit.addEventListener(
    "click",
    dialogReplayCurrentGameStateHandler
  );
  const containerConfirmNoDataCommit = domReplayLogger.querySelector(
    ".dialogReplayNoData .containerConfirmCancel"
  );
  if (!containerConfirmNoDataCommit) {
    throw new Error(
      "cannot relocate container element for no commit data confirmation"
    );
  }
  const containerConfirmNoHistoryData = domReplayLogger.querySelector(
    ".dialogUploadNoData .containerConfirmCancel"
  );
  if (!containerConfirmNoHistoryData) {
    throw new Error(
      "cannot relocate container element for no game history data confirmation"
    );
  }
  containerConfirmNoDataCommit.addEventListener(
    "click",
    dialogInvalidStateForReplayHandler
  );
  containerConfirmNoHistoryData.addEventListener(
    "click",
    dialogNoHistoryDataFoundHandler
  );
  domReplayLogger.addEventListener("click", async (event) => {
    try {
      const domReplayLogger = event.currentTarget;
      const icon = event.target.closest("svg");
      if (!icon || !icon.classList.contains("icon2")) {
        return;
      }
      const gridItem = icon.closest("div");
      if (!gridItem) {
        return;
      }
      if (gridItem.classList.contains("footerReplayBackwardStep")) {
        await loadGameHistoryMove(-1);
      }
      if (gridItem.classList.contains("footerReplayBackwardFast")) {
        await loadGameHistoryMove(-Infinity);
      }
      if (gridItem.classList.contains("footerReplayForwardStep")) {
        await loadGameHistoryMove(1);
      }
      if (gridItem.classList.contains("footerReplayForwardFast")) {
        await loadGameHistoryMove(Infinity);
      }
      if (gridItem.classList.contains("footerReplayPlayPause")) {
        const iconPlay = gridItem.querySelector(".iconPlay");
        const iconPause = gridItem.querySelector(".iconPause");
        if (!iconPlay || !iconPause) {
          throw new Error("cannot relocate play or pause icon");
        }
        iconPlay.classList.toggle("svgHide");
        iconPause.classList.toggle("svgHide");
        if (iconPause.classList.contains("svgHide")) {
          await autoPlayTerminate();
        } else {
          await autoPlayManager();
        }
      }
      const iconPlay = domReplayLogger.querySelector(
        ".footerReplayPlayPause .iconPlay"
      );
      const iconPause = domReplayLogger.querySelector(
        ".footerReplayPlayPause .iconPause"
      );
      if (gridItem.classList.contains("navbarReturnHome")) {
        window.location.hash = "#sectHome";
        if (iconPlay.classList.contains("svgHide")) {
          iconPlay.classList.toggle("svgHide");
          iconPause.classList.toggle("svgHide");
          await autoPlayTerminate();
        }
      }
      if (gridItem.classList.contains("navbarUploadModal")) {
        if (iconPlay.classList.contains("svgHide")) {
          iconPlay.classList.toggle("svgHide");
          iconPause.classList.toggle("svgHide");
          await autoPlayTerminate();
        }
        const dialogForGameSelection =
          gridItem.querySelector(".dialogUploadModal");
        if (!dialogForGameSelection) {
          throw new Error("cannot relocate dialog element");
        }
        const dialogNoData = gridItem.querySelector(".dialogUploadNoData");
        if (!dialogNoData) {
          throw new Error("cannot relocate dialog element");
        }
        if (LoggerReader.instances.size === 0) {
          dialogNoData.showModal();
        } else {
          dialogForGameSelection.showModal();
        }
      }
      if (gridItem.classList.contains("navbarReplayCommit")) {
        if (iconPlay.classList.contains("svgHide")) {
          iconPlay.classList.toggle("svgHide");
          iconPause.classList.toggle("svgHide");
          await autoPlayTerminate();
        }
        const dialogReplayCommit = gridItem.querySelector(
          ".dialogReplayCommit"
        );
        if (!dialogReplayCommit) {
          throw new Error("cannot relocate dialog element for replay commit");
        }
        const dialogReplayNoData = gridItem.querySelector(
          ".dialogReplayNoData"
        );
        if (!dialogReplayNoData) {
          throw new Error("cannot relocate dialog element no data commit info");
        }
        if (
          LoggerReader.instances.size === 0 ||
          !LoggerReader.currentSelectedInstance
        ) {
          dialogReplayNoData.showModal();
          return;
        }
        const lastBotMove = Number(
          dialogReplayCommit
            .querySelector(".containerConfirmCancel")
            .getAttribute("data-last-bot-move")
        );
        if (
          lastBotMove === null ||
          lastBotMove === undefined ||
          isNaN(lastBotMove)
        ) {
          throw new Error(
            "cannot relocate last bot move attribute or cancel icon"
          );
        }
        const containerConfirmCancelCaption =
          containerConfirmCancelCommit.querySelector(
            ".containerConfirmCancelCaption"
          );
        if (!containerConfirmCancelCaption) {
          throw new Error(
            "cannot relocate caption element for replay commit dialog"
          );
        }
        containerConfirmCancelCaption.textContent = `Replay after bot move #${String(
          lastBotMove
        )} ?`;
        dialogReplayCommit.showModal();
      }
    } catch (error) {
      handleErrorEvent(error);
      throw new Error(error);
    }
  });
  gameReplayScrollContainer.addEventListener(
    "click",
    dialogGameReplaySelectionHandler
  );
}

/**
 * Main entry point for the game.
 * @returns {void}
 */
window.addEventListener("load", async (_) => {
  try {
    window.location.hash = "#sectHome";
    if (!window.Worker) {
      throw new Error(
        "Web Workers are not supported in this browser. Please use a modern browser."
      );
    }
    const domBoard = document.querySelector("#sectHome .board");
    const domBoardState = createBoard(domBoard);
    forceCSSColorSchemeSelection();
    BoardState.currentLiveInstance = domBoardState;
    LoggerReader.initialDomBoardState = domBoardState.cloneInstance();
    LoggerReader.historyBoard = createHistoryBoard(domBoardState);
    LoggerReader.scrollItemTemplate = document.querySelector(
      "#sectReplayLogger .navbarUploadModal template"
    );
    LoggerReader.scrollContainer = document.querySelector(
      "#sectReplayLogger .navbarUploadModal main"
    );
    const navbar = document.querySelector(".navbar");
    const bot = domBoardState.playerState.twoPlayer.find(
      (player) => player.id === PLAYER_ID.BOT
    );
    const user = domBoardState.playerState.twoPlayer.find(
      (player) => player.id === PLAYER_ID.USER
    );
    createSidebar(bot, document.querySelector("#sectHome .sidebarBot"), false);
    createSidebar(
      user,
      document.querySelector("#sectHome .sidebarUser"),
      false
    );
    Sidebar.playerMap.get(user).markDashboard();
    Sidebar.playerMap.get(bot).unmarkDashboard();
    const playerStateHistory = createPlayer();
    const botHistory = playerStateHistory.twoPlayer.find(
      (player) => player.id === PLAYER_ID.BOT
    );
    const userHistory = playerStateHistory.twoPlayer.find(
      (player) => player.id === PLAYER_ID.USER
    );
    createSidebar(
      botHistory,
      document.querySelector("#sectReplayLogger .sidebarBot"),
      true
    );
    createSidebar(
      userHistory,
      document.querySelector("#sectReplayLogger .sidebarUser"),
      true
    );
    LoggerReader.playerHistoryBot = botHistory;
    LoggerReader.playerHistoryUser = userHistory;
    aiWorker = new Worker("./modules/AiWorker.js", { type: "module" });
    dbWorker = new Worker("./modules/DbWorker.js", { type: "module" });
    LoggerWriter.dbWorker = dbWorker;
    //open IndexedDB database
    const dbWorkerRequest = structuredClone(workerMessageScheme);
    dbWorkerRequest.request.type = "open";
    const dbWorkerResponse = await dispatchWorker(dbWorker, dbWorkerRequest);
    if (dbWorkerResponse.response.error === true) {
      throw new Error(
        "Caught error in db worker for open database request: " +
          dbWorkerResponse.response.message
      );
    }
    const settings = new Settings(dbWorker);
    const loggerWriter = new LoggerWriter(domBoardState);
    LoggerWriter.currentLiveInstance = loggerWriter;
    await settings.load();
    initSettingsEventHandlers(settings);
    await loadReplayLogger();
    initReplayLoggerEventHandlers();
    initBoardEventHandlers(domBoard, domBoardState, settings, loggerWriter);
    initNavbarEventHandlers(domBoardState, loggerWriter, navbar);
  } catch (error) {
    handleErrorEvent(error);
    throw new Error(error);
  }
});

/**
 * Centralized error event handling in the main thread for unhandled or rethrown error events.
 * @returns {void}
 */
window.addEventListener("error", (errorEvent) => {
  errorEvent.stopImmediatePropagation();
  isFatalError = true;

  handleErrorEvent(errorEvent.error || new Error("Unknown error"));
  if (dbWorker && dbWorker instanceof Worker) {
    dbWorker.terminate();
  }
  if (aiWorker && aiWorker instanceof Worker) {
    aiWorker.terminate();
  }
});

/**
 * Centralized event handling in the main thread for unhandled promise rejections.
 * @returns {void}
 */
window.addEventListener("unhandledrejection", (event) => {
  const error = event.reason;
  console.error("--- Unhandled Promise Rejection Detected ---");
  handleErrorEvent(error);
  console.error("-------------------------------------------");
  event.preventDefault();
});

export { reCreateAiWorker };
