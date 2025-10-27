/**
 * @module ReplayhistoryEventLoop
 * @description The main for handling the game replay section.
 * @requires module:Logger
 * @requires module:GameState
 * @requires module:GameEventLoop
 * @requires module:ErrorUtils
 * @requires module:AsyncApiWrapper
 * @exports loadGameHistoryMove - load and print the next move in the game replay section
 * @exports  autoPlayTerminate - trigger and await the autoplay termination after clicking the pause icon
 * @exports  autoPlayManager - mange the autoplay state for game replay
 * @exports  updateSvg - helper function for printing the piece for a cell
 * @exports  dialogGameReplaySelectionHandler - Event Listener callback functions inside the upload dialog
 * @exports  dialogReplayCurrentGameStateHandler - Event listener callback functions inside the replay commit dialog
 * @exports  dialogNoHistoryDataFoundHandler - Event listener callback functions for the "no game data in db" dialog
 * @exports  dialogInvalidStateForReplayHandler - Event listener callback functions for the "no game state to replay" dialog
 */
import { handleErrorEvent } from "./ErrorUtils.js";
import { LoggerWriter, LoggerReader } from "./Logger.js";
import { PLAYER_ID, BoardState, Sidebar } from "./GameState.js";
import { resetGame } from "./GameEventLoop.js";
import { autoPlayTerminated } from "./AsyncAPIWrapper.js";

const AUTOPLAY_SETTINGS = Object.freeze({
  TIMEOUT: 1700,
});

/**
 * This is the main function for the game replay user interface frontend.
 * It renders the new game state after clicking on the replay icons in the footer.
 * @param {Number} advanceSteps
 * @returns {Promise<void>}
 */
async function loadGameHistoryMove(advanceSteps) {
  await navigator.locks.request(
    "loadGameHistoryMove",
    { mode: "exclusive" },
    async (lock) => {
      if (
        LoggerReader.instances.size === 0 ||
        !LoggerReader.currentSelectedInstance
      ) {
        return;
      }
      const loggerReader = LoggerReader.currentSelectedInstance;
      const record = await loggerReader.fetchRecord(advanceSteps);
      const gridCells = record.boardState._cells;
      const domChildren = Array.from(LoggerReader.historyBoard.children);
      domChildren.forEach((domGridItem, index) => {
        domGridItem.classList.remove("mark", "click");
        const gridCell = gridCells[index];
        const svgLayout = gridCell._svgLayout;
        const hasDot = gridCell._dot;
        updateSvg(domGridItem, svgLayout, hasDot);
      });
      if (record.lastMove) {
        const moveSrcCell = record.lastMove._srcCell;
        const moveTgtCell = record.lastMove._tgtCell;
        const moveSrcDomCell = domChildren.find((cell, index) => {
          if (index === moveSrcCell._id) {
            return true;
          }
        });
        const moveTgtDomCell = domChildren.find((cell, index) => {
          if (index === moveTgtCell._id) {
            return true;
          }
        });
        moveSrcDomCell.classList.add("mark");
        moveTgtDomCell.classList.add("click");
      }
      if (record.move === 0) {
        record.boardState._playerState._twoPlayer.forEach((player) => {
          player._turn = false;
        });
      }
      prettifyMoveNumber(record.move);
      refreshSidebars(record.boardState._playerState);
      updateLastBotMove(record.move, record.boardState._playerState);
    }
  );
}

/**
 * This is just a helper function timeout function wrapper for the async/await pattern.
 * @param {Number} timeout
 * @returns {Promise<void>}
 */
async function waitForNextAutoPlay(timeout = AUTOPLAY_SETTINGS.TIMEOUT) {
  return new Promise((resolve, _) => {
    setTimeout(() => {
      resolve();
    }, timeout);
  });
}

/**
 * This function handles the auto play loop.
 * @param {LoggerReader} reader
 * @returns {Promise<void>}
 */
async function autoPlayLongRunning(reader) {
  return new Promise(async (resolve, reject) => {
    try {
      while (true) {
        await loadGameHistoryMove(1);
        if (reader.autoPlayActive === false) {
          break;
        }
        await waitForNextAutoPlay();
      }
      resolve();
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * This function triggers the auto play loop and also dispatches
 * the auto play termination event.
 * @returns {Promise<void>}
 */
async function autoPlayManager() {
  const reader = LoggerReader.currentSelectedInstance;
  if (
    !reader ||
    reader.autoPlayActive === true ||
    reader.eventTarget !== null
  ) {
    throw new Error(
      "Unable to select LoggerReader instance for game auto play"
    );
  }
  reader.autoPlayActive = true;
  await autoPlayLongRunning(reader);
  reader.eventTarget.dispatchEvent(new Event("autoplayterminate"));
}

/**
 * This function awaits the auto play termination.
 * @returns {Promise<void>}
 */
async function autoPlayTerminate() {
  await navigator.locks.request(
    "autoPlayTerminate",
    { mode: "exclusive", ifAvailable: true },
    async (lock) => {
      if (!lock) {
        return;
      }
      const reader = LoggerReader.currentSelectedInstance;
      if (
        !reader ||
        reader.autoPlayActive === false ||
        reader.eventTarget !== null
      ) {
        return;
      }
      await autoPlayTerminated(reader);
    }
  );
}

/**
 * This function displays the game piece for a specific cell on the board.
 * @param {HTMLDivElement} domEl
 * @param {String[]} svgLayout
 * @param {Boolean} dot
 * @returns {void}
 */
function updateSvg(domEl, svgLayout, dot) {
  let svgLayoutString;
  if (svgLayout.length === 0) {
    svgLayoutString = "none";
  } else {
    svgLayoutString = svgLayout.join("_");
    if (dot === true) {
      svgLayoutString += "_dot";
    }
  }
  const svgSymbol = `tower_${svgLayoutString}`;
  domEl
    .querySelector("use")
    .setAttribute("href", `./images/pieces.svg#${svgSymbol}`);
}

/**
 * This function updates the current move number for this game in the dom.
 * @param {Number} moveNo
 * @returns {void}
 */
function prettifyMoveNumber(moveNo) {
  const hundreds = Math.floor(moveNo / 100);
  const tens = Math.floor((moveNo % 100) / 10);
  const ones = moveNo % 10;
  document
    .querySelector(".navbarReplayMoveHundreds > svg > use")
    .setAttribute("href", `./images/icons.svg#icon_digit_${hundreds}`);
  document
    .querySelector(".navbarReplayMoveTens > svg > use")
    .setAttribute("href", `./images/icons.svg#icon_digit_${tens}`);
  document
    .querySelector(".navbarReplayMoveOnes > svg > use")
    .setAttribute("href", `./images/icons.svg#icon_digit_${ones}`);
}

/**
 * This functions updates the current player state in the dom for the current replayed move.
 * @param {PlayerState} playerState
 * @returns {void}
 */
function refreshSidebars(playerState) {
  const logRecordDataUser = playerState._twoPlayer.find(
    (player, _) => player._id === PLAYER_ID.USER
  );
  const logRecordDataBot = playerState._twoPlayer.find(
    (player, _) => player._id === PLAYER_ID.BOT
  );
  const playerUser = LoggerReader.playerHistoryUser;
  const playerBot = LoggerReader.playerHistoryBot;
  playerUser.turn = logRecordDataUser._turn;
  playerUser.lastHorizontal = logRecordDataUser._lastHorizontal;
  playerUser.safetyTower = logRecordDataUser._safetyTower;
  playerUser.vault = logRecordDataUser._vault;
  playerUser.winner = logRecordDataUser._winner;
  playerBot.turn = logRecordDataBot._turn;
  playerBot.lastHorizontal = logRecordDataBot._lastHorizontal;
  playerBot.safetyTower = logRecordDataBot._safetyTower;
  playerBot.vault = logRecordDataBot._vault;
  playerBot.winner = logRecordDataBot._winner;
  Sidebar.playerMapHistory.get(playerUser).refreshDashboard();
  Sidebar.playerMapHistory.get(playerBot).refreshDashboard();
  if (playerUser.turn === false && playerBot.turn === false) {
    Sidebar.playerMapHistory.get(playerUser).unmarkDashboard();
    Sidebar.playerMapHistory.get(playerBot).unmarkDashboard();
  }
  if (playerUser.turn === false && playerBot.turn === true) {
    Sidebar.playerMapHistory.get(playerUser).markDashboard();
    Sidebar.playerMapHistory.get(playerBot).unmarkDashboard();
  }
  if (playerUser.turn === true && playerBot.turn === false) {
    Sidebar.playerMapHistory.get(playerUser).unmarkDashboard();
    Sidebar.playerMapHistory.get(playerBot).markDashboard();
  }
}

/**
 * This helper function maintains the data-property value for a container element
 * inside the replay commitment dialog.
 * This property value caches the last played bot move for restarting a new game from history.
 * @param {Number} moveNo
 * @param {PlayerState} playerState
 * @returns {void}
 */
function updateLastBotMove(moveNo, playerState) {
  const helperDiv = document.querySelector(
    "#sectReplayLogger .dialogReplayCommit .containerConfirmCancel"
  );
  const helperHeader = helperDiv.querySelector(
    ".containerConfirmCancelCaption"
  );
  if (isNaN(moveNo)) {
    throw new Error("invalid move number!");
  }
  const logRecordDataBot = playerState._twoPlayer.find(
    (player, _) => player._id === PLAYER_ID.BOT
  );
  if (moveNo > 0 && (!logRecordDataBot || logRecordDataBot._turn === true)) {
    return;
  }
  helperHeader.textContent = `Replay after bot move ###${String(moveNo)} ?`;
  helperDiv.setAttribute("data-last-bot-move", String(moveNo));
}

/**
 * This helper function updates the current BoardState instance, in order
 * to restart a new game after a specific move from the game history replay section.
 * @param {Object} record
 * @param {BoardState} domBoardState
 * @returns {void}
 */
function replayToSelectedBoardState(record, domBoardState) {
  const newBoardState = BoardState.createFromStructuredClone(record.boardState);
  const newPlayerBot = newBoardState.playerState.twoPlayer.find(
    (player) => player.id === PLAYER_ID.BOT
  );
  const newPlayerUser = newBoardState.playerState.twoPlayer.find(
    (player) => player.id === PLAYER_ID.USER
  );
  domBoardState.cells.forEach((cell, index) => {
    const newCell = newBoardState._cells[index];
    cell.svgLayout = newCell._svgLayout;
    cell.direction = newCell._direction;
    cell.dot = newCell._dot;
    cell.updateSvg();
  });
  domBoardState.playerState.twoPlayer.forEach((player) => {
    if (player.id === PLAYER_ID.BOT) {
      player.turn = newPlayerBot.turn;
      player.lastHorizontal = newPlayerBot.lastHorizontal;
      player.safetyTower = newPlayerBot.safetyTower;
      player.vault = newPlayerBot.vault;
      player.winner = newPlayerBot.winner;
      Sidebar.playerMap.get(player).unmarkDashboard();
    }
    if (player.id === PLAYER_ID.USER) {
      player.turn = newPlayerUser.turn;
      player.lastHorizontal = newPlayerUser.lastHorizontal;
      player.safetyTower = newPlayerUser.safetyTower;
      player.vault = newPlayerUser.vault;
      player.winner = newPlayerUser.winner;
      Sidebar.playerMap.get(player).markDashboard();
    }
    Sidebar.playerMap.get(player).refreshDashboard();
  });
}

/**
 * This callback handles the click events for the confirm and cancel icons
 * inside a specific snapped scroll item for game replay selection.
 * @param {Event} event
 * @returns {Promise<void>}
 */
async function dialogGameReplaySelectionHandler(event) {
  try {
    const confirmIcon = event.target.closest(".selectGameId");
    const cancelIcon = event.target.closest(".cancelGameDialog");
    if (!confirmIcon && !cancelIcon) {
      return;
    }
    if (cancelIcon) {
      const dialog = cancelIcon.closest(".dialogUploadModal");
      if (!dialog || !(dialog instanceof HTMLDialogElement)) {
        throw new Error("cannot relocate dialog element for game replay");
      }
      dialog.close();
      return;
    }
    const panel = confirmIcon.closest(".panelGameId");
    if (!panel || !(panel instanceof HTMLDivElement)) {
      throw new Error("cannot relocate scroll itemn panel for game replay");
    }
    const dialog = panel.closest(".dialogUploadModal");
    if (!dialog || !dialog instanceof HTMLDialogElement) {
      throw new Error("cannot relocate dialog element for game replay");
    }
    let gameId = panel.getAttribute("data-db-key");
    if (!gameId || isNaN(gameId)) {
      dialog.close();
      return;
    }
    gameId = Number(gameId);
    LoggerReader.currentSelectedInstance = LoggerReader.instances.get(gameId);
    await loadGameHistoryMove(Infinity);
    dialog.close();
  } catch (error) {
    handleErrorEvent(error);
    throw new Error(error);
  }
}

/**
 * This callback handles the click event for a confirm icon of a specific dialog,
 * that opens only if there is no meaningful data to be replayed and restarted from.
 * @param {Event} event
 * @returns {Promise<void>}
 */
async function dialogInvalidStateForReplayHandler(event) {
  try {
    const clickedIcon = event.target.closest("svg");
    if (
      !clickedIcon ||
      !(clickedIcon instanceof SVGSVGElement) ||
      !clickedIcon.classList.contains("iconConfirm")
    ) {
      return;
    }
    const dialog = event.target.closest(".dialogReplayNoData");
    if (!dialog || !(dialog instanceof HTMLDialogElement)) {
      return;
    }
    const container = dialog.querySelector(".containerConfirmCancel");
    if (!container || !(container instanceof HTMLDivElement)) {
      return;
    }
    dialog.close();
  } catch (error) {
    handleErrorEvent(error);
    throw new Error(error);
  }
}

/**
 * This callback handles the click event for a confirm icon of a specific dialog,
 * that opens only if there is no logged game state data in the database at all.
 * @param {Event} event
 * @returns {Promise<void>}
 */
async function dialogNoHistoryDataFoundHandler(event) {
  try {
    const clickedIcon = event.target.closest("svg");
    if (
      !clickedIcon ||
      !(clickedIcon instanceof SVGSVGElement) ||
      !clickedIcon.classList.contains("iconConfirm")
    ) {
      return;
    }
    const dialog = event.target.closest(".dialogUploadNoData");
    if (!dialog || !(dialog instanceof HTMLDialogElement)) {
      return;
    }
    const container = dialog.querySelector(".containerConfirmCancel");
    if (!container || !(container instanceof HTMLDivElement)) {
      return;
    }
    dialog.close();
  } catch (error) {
    handleErrorEvent(error);
    throw new Error(error);
  }
}

/**
 * This callback handles the click events for a confirm and a cancel icon of a specific dialog,
 * that opens for restarting a new game, beginning after this replayed game state.
 * @param {Event} event
 * @returns {Promise<void>}
 */
async function dialogReplayCurrentGameStateHandler(event) {
  try {
    const clickedIcon = event.target.closest("svg");
    if (!clickedIcon || !(clickedIcon instanceof SVGSVGElement)) {
      return;
    }
    const dialog = event.target.closest(".dialogReplayCommit");
    if (!dialog || !(dialog instanceof HTMLDialogElement)) {
      return;
    }
    const container = dialog.querySelector(".containerConfirmCancel");
    if (!container || !(container instanceof HTMLDivElement)) {
      return;
    }
    const lastBotMove = Number(container.getAttribute("data-last-bot-move"));
    if (isNaN(lastBotMove)) {
      dialog.close();
      return;
    }
    if (clickedIcon.classList.contains("iconCancel")) {
      dialog.close();
      return;
    }
    if (!clickedIcon.classList.contains("iconConfirm")) {
      return;
    }
    const reader = LoggerReader.currentSelectedInstance;
    if (!reader) {
      throw new Error("no logger reader instance selected for game replay");
    }
    await reader.fetchRecord(-Infinity);
    const record = await reader.fetchRecord(lastBotMove);
    resetGame(BoardState.currentLiveInstance, LoggerWriter.currentLiveInstance);
    replayToSelectedBoardState(record, BoardState.currentLiveInstance);
    LoggerReader.initialDomBoardState =
      BoardState.currentLiveInstance.cloneInstance();
    window.location.hash = "#sectHome";
    dialog.close();
  } catch (error) {
    handleErrorEvent(error);
    throw new Error(error);
  }
}

export {
  loadGameHistoryMove,
  autoPlayTerminate,
  autoPlayManager,
  updateSvg,
  dialogGameReplaySelectionHandler,
  dialogReplayCurrentGameStateHandler,
  dialogNoHistoryDataFoundHandler,
  dialogInvalidStateForReplayHandler,
};
