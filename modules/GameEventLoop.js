/**
 * @module GameEventLoop
 * @description The main logic for handling the each players's move in the current game.
 * @requires module:GameState
 * @requires module:GameLogic
 * @requires module:AsyncAPIWrapper
 * @requires module:main
 * @requires module:Logger
 * @exports enableBoardEvents - Re-enable animations after a bot's move and on the user's turn
 * @exports handleHoveredCellIn - Helper function managing animations related to the move selection for the user
 * @exports handleHoveredCellOut - Helper function managing animations related to the move selection for the user
 * @exports prepareMoveForCell - Helper function managing animations related to the move selection for the user
 * @exports discardMoveForCell - Helper function managing animations related to the move selection for the user
 * @exports playUserMove - Trigger the user and subsequent bot move cycle for the currewnt game
 * @exports resetGame - Reset the whole game, the old game history can still be replayed
 */
import { PLAYER_ID, GridCell, BoardState, Sidebar, Move } from "./GameState.js";
import { checkWin, getLocalMoves } from "./GameLogic.js";
import {
  dispatchWorker,
  workerMessageScheme,
  cssTransitionEnded,
} from "./AsyncAPIWrapper.js";
import { reCreateAiWorker } from "../main.js";
import { LoggerReader } from "./Logger.js";

/**
 * Handles the mouse hover event on entry of a cell in the BoardState.
 * It highlights the hovered cell and its valid neighboring cells for the current player.
 *
 * @param {GridCell} hoveredCell
 * @param {BoardState, Sidebar} domBoardState
 * @param {Player} currentPlayer
 * @returns {void}
 */
function handleHoveredCellIn(hoveredCell, domBoardState, currentPlayer) {
  const markedCells = document.querySelectorAll("#sectHome .board .mark");
  if (markedCells.length > 0) {
    return;
  }
  const neighbors = getLocalMoves(hoveredCell, currentPlayer, domBoardState);
  if (neighbors.length === 0) {
    return;
  }
  hoveredCell.addClass("select");
  neighbors.forEach((neighbor) => {
    neighbor.addClass("hover");
  });
}

/**
 * Handles the mouse hover event on exit of a cell in the BoardState.
 * It removes the highlight from the hovered cell and its valid neighboring cells.
 *
 * @returns {void}
 */
function handleHoveredCellOut() {
  document.querySelectorAll(".hover, .select").forEach((cell) => {
    cell.classList.remove("hover", "select");
  });
}

/**
 * This function handles the first out of two "click event verification steps",
 * in order to play the move in the browser UI.
 * It marks and highlights the clicked source cell persistently as well as all valid target cells,
 * e.g. the hovering effects for all cells are disabled.
 * Returns true if the move was prepared successfully, false otherwise.
 * @param {GridCell} clickedCell
 * @returns {boolean}
 */
function prepareMoveForCell(clickedCell) {
  if (clickedCell.domEl.classList.contains("select")) {
    clickedCell.removeClass("select");
    clickedCell.addClass("mark");
    document.querySelectorAll("#sectHome .board .hover").forEach((cell) => {
      cell.classList.remove("hover");
      cell.classList.add("click");
    });
    return true;
  }
  return false;
}

/**
 * This function discards the marked cell in the prepare step for movement,
 * and re-enables the hovering effects for all cells.
 * Returns true if the discard was successfully, false otherwise.
 * @param {GridCell} clickedCell
 * @returns {boolean}
 */
function discardMoveForCell(clickedCell) {
  if (clickedCell.domEl.classList.contains("mark")) {
    clickedCell.domEl.classList.remove("mark");
    document.querySelectorAll("#sectHome .board .click").forEach((cell) => {
      cell.classList.remove("click");
    });
    return true;
  }
  return false;
}

/**
 * All UI events for the board must be disabled during the AI processing of the spawned Web Worker.
 * @param {BoardState} domBoardState
 * @returns {void}
 */
function disableBoardEvents(domBoardState) {
  // Disable all event handlers for the board to prevent further interactions
  domBoardState.disableBoardEvents = true;
}

/**
 * Enable all UI events for the next move after the AI processing of the spawned Web Worker.
 * @param {BoardState} domBoardState
 * @returns {void}
 */
function enableBoardEvents(domBoardState) {
  // Disable all event handlers for the board to prevent further interactions
  domBoardState.disableBoardEvents = false;
}

/**
 * Removes all cell effects after a played move.
 * @returns {void}
 */
function discardBoardAnimations() {
  document.querySelectorAll("#sectHome .boardCell").forEach((cell) => {
    cell.classList.remove("select", "hover", "mark", "click");
  });
}

/**
 * This function handles the new user move in the live game.
 * @param {BoardState} domBoardState
 * @param {Settings} settings
 * @param {Worker} aiWorker
 * @param {LoggerWriter} loggerWriter
 * @param {GridCell} clickedCell
 * @returns {Promise<void>}
 */
async function playUserMove(
  domBoardState,
  settings,
  aiWorker,
  loggerWriter,
  clickedCell
) {
  // Main game event loop starts here
  const markedCell = domBoardState.mapDomElement.get(
    document.querySelector("#sectHome .board .mark")
  );
  // Play move, update BoardState, update Sidebar and turn player
  domBoardState.applyMoveAndTurn(
    markedCell,
    clickedCell,
    settings.winningRules.settings.maxStackSize
  );
  disableBoardEvents(domBoardState);
  discardBoardAnimations();
  const playerUser = domBoardState.playerState.twoPlayer.find(
    (player) => player.turn === false
  );
  const playerBot = domBoardState.playerState.twoPlayer.find(
    (player) => player.turn === true
  );
  Sidebar.playerMap.get(playerUser).refreshDashboard();
  // interactive player has won?
  if (checkWin(domBoardState, playerUser, settings)) {
    await loggerWriter.update(
      new Move(markedCell, clickedCell, domBoardState.playerState)
    );
    document.querySelector("#sectHome .board").classList.add("filterGray");
    Sidebar.playerMap.get(playerUser).refreshDashboard();
  } else {
    await loggerWriter.update(
      new Move(markedCell, clickedCell, domBoardState.playerState)
    );
    // mark dashboard
    Sidebar.playerMap.get(playerUser).unmarkDashboard();
    Sidebar.playerMap.get(playerBot).markDashboard();
    await playBotMove(domBoardState, settings, aiWorker, loggerWriter);
  }
}

/**
 * This function communicates with the ai worker thread
 * using event based messaging for finding the next best move.
 * @param {BoardState} domBoardState
 * @param {Settings} settings
 * @param {Worker} aiWorker
 * @param {LoggerWriter} loggerWriter
 * @returns {Promise<void>}
 */
async function playBotMove(domBoardState, settings, aiWorker, loggerWriter) {
  //animate css load spinner
  const spinner1 = document.querySelector(".spinner1");
  const spinner2 = document.querySelector(".spinner2");
  const spinner3 = document.querySelector(".spinner3");
  const spinner4 = document.querySelector(".spinner4");
  const spinner5 = document.querySelector(".spinner5");
  const spinner6 = document.querySelector(".spinner6");
  spinner1.classList.add("spinner1Animate");
  spinner2.classList.add("spinner2Animate");
  spinner3.classList.add("spinner3Animate");
  spinner4.classList.add("spinner4Animate");
  spinner5.classList.add("spinner5Animate");
  spinner6.classList.add("spinner6Animate");
  spinner1.querySelector("g").classList.remove("svgHide");
  spinner2.querySelector("g").classList.remove("svgHide");
  spinner3.querySelector("g").classList.remove("svgHide");
  spinner4.querySelector("g").classList.remove("svgHide");
  spinner5.querySelector("g").classList.remove("svgHide");
  spinner6.querySelector("g").classList.remove("svgHide");
  // Dispatch worker for AI processing
  domBoardState.waitForWebWorker = true;
  const aiWorkerRequest = structuredClone(workerMessageScheme);
  aiWorkerRequest.request.type = "findBestMove";
  aiWorkerRequest.request.parameter.push(domBoardState.cloneInstance());
  aiWorkerRequest.request.parameter.push(settings.cloneInstance());
  const aiWorkerResponse = await dispatchWorker(
    aiWorker,
    aiWorkerRequest,
    settings.searchRules.settings.timeout * 1000
  );
  if (aiWorkerResponse.response.error === true) {
    if (aiWorkerResponse.response.message === "timeout") {
      //hide css load spinner
      spinner1.classList.remove("spinner1Animate");
      spinner2.classList.remove("spinner2Animate");
      spinner3.classList.remove("spinner3Animate");
      spinner4.classList.remove("spinner4Animate");
      spinner5.classList.remove("spinner5Animate");
      spinner6.classList.remove("spinner6Animate");
      spinner1.querySelector("g").classList.add("svgHide");
      spinner2.querySelector("g").classList.add("svgHide");
      spinner3.querySelector("g").classList.add("svgHide");
      spinner4.querySelector("g").classList.add("svgHide");
      spinner5.querySelector("g").classList.add("svgHide");
      spinner6.querySelector("g").classList.add("svgHide");
      reCreateAiWorker();
      handleAiWorkerTimeout(domBoardState, loggerWriter);
      return;
    } else {
      throw new Error(
        "Caught error in ai worker: " + aiWorkerResponse.response.message
      );
    }
  }
  // deserialize ai worker response and map the GridCell instances for the next move
  let srcCellId = aiWorkerResponse.response.message[0]._id ?? null;
  let tgtCellId = aiWorkerResponse.response.message[1]._id ?? null;
  if (
    srcCellId === null ||
    tgtCellId === null ||
    isNaN(srcCellId) ||
    isNaN(tgtCellId)
  ) {
    throw new Error(
      "Invalid move data received from worker. Expected two integers for the source and target cell identifiers."
    );
  }
  let moveBotSrcInst = domBoardState.cells.find(
    (cell) => cell.id === srcCellId
  );
  moveBotSrcInst ??= null;
  let moveBotTgtInst = domBoardState.cells.find(
    (cell) => cell.id === tgtCellId
  );
  moveBotTgtInst ??= null;
  if (
    moveBotSrcInst === null ||
    moveBotTgtInst === null ||
    !moveBotSrcInst instanceof GridCell ||
    !moveBotTgtInst instanceof GridCell
  ) {
    throw new Error(
      "Invalid move data received from worker. Invalid integer identifier for the source or target cell."
    );
  }
  //hide css load spinner
  spinner1.classList.remove("spinner1Animate");
  spinner2.classList.remove("spinner2Animate");
  spinner3.classList.remove("spinner3Animate");
  spinner4.classList.remove("spinner4Animate");
  spinner5.classList.remove("spinner5Animate");
  spinner6.classList.remove("spinner6Animate");
  spinner1.querySelector("g").classList.add("svgHide");
  spinner2.querySelector("g").classList.add("svgHide");
  spinner3.querySelector("g").classList.add("svgHide");
  spinner4.querySelector("g").classList.add("svgHide");
  spinner5.querySelector("g").classList.add("svgHide");
  spinner6.querySelector("g").classList.add("svgHide");
  // trigger animations for this bot's move and wait for the end of the css transitions
  await cssTransitionEnded(moveBotSrcInst.domEl, "select");
  await cssTransitionEnded(moveBotTgtInst.domEl, "hover");
  // apply move
  domBoardState.applyMoveAndTurn(
    moveBotSrcInst,
    moveBotTgtInst,
    settings.winningRules.settings.maxStackSize
  );
  // remove css classes for cleanup and animation of this bot's move
  moveBotSrcInst.domEl.classList.remove("select");
  moveBotTgtInst.domEl.classList.remove("hover");
  const playerBot = domBoardState.playerState.twoPlayer.find(
    (player) => player.turn === false
  );
  const playerUser = domBoardState.playerState.twoPlayer.find(
    (player) => player.turn === true
  );
  Sidebar.playerMap.get(playerBot).refreshDashboard();
  domBoardState.waitForWebWorker = false;
  if (checkWin(domBoardState, playerBot, settings)) {
    await loggerWriter.update(
      new Move(moveBotSrcInst, moveBotTgtInst, domBoardState.playerState)
    );
    document.querySelector("#sectHome .board").classList.add("filterGray");
    Sidebar.playerMap.get(playerBot).refreshDashboard();
  } else {
    await loggerWriter.update(
      new Move(moveBotSrcInst, moveBotTgtInst, domBoardState.playerState)
    );
    // mark dashboard
    Sidebar.playerMap.get(playerUser).markDashboard();
    Sidebar.playerMap.get(playerBot).unmarkDashboard();
    // Enable board events for the next move
    enableBoardEvents(domBoardState);
  }
}

/**
 * Resets the game state for all DOM elements, Event Handlers and instances.
 * @param {BoardState} domBoardState
 * @returns {void}
 */
function resetGame(domBoardState, loggerWriter) {
  domBoardState.cells.forEach((cell) => {
    cell.svgLayout = [];
    cell.updateSvg();
    cell.direction = 0;
    cell.dot = false;
  });
  domBoardState.playerState.twoPlayer.forEach((player) => {
    if (player.id === PLAYER_ID.BOT) {
      player.turn = false;
      Sidebar.playerMap.get(player).unmarkDashboard();
    } else {
      player.turn = true;
      Sidebar.playerMap.get(player).markDashboard();
    }
    player.lastHorizontal = false;
    player.safetyTower = 0;
    player.vault.self = 0;
    player.vault.opponent = 0;
    player.winner = false;
    Sidebar.playerMap.get(player).refreshDashboard();
  });
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
  enableBoardEvents(domBoardState);
  document.querySelector("#sectHome .board").classList.remove("filterGray");
  domBoardState.waitForWebWorker = false;
  loggerWriter.gameId = Date.now();
  loggerWriter.move = 0;
  LoggerReader.initialDomBoardState = domBoardState.cloneInstance();
}

/**
 * The ai worker thread was terminated due to a timeout condition.
 * Shows the info dialog and resets the game state.
 * @param {BoardState} domBoardState
 * @returns {void}
 */
function handleAiWorkerTimeout(domBoardState, loggerWriter) {
  const dialog = document.querySelector("#sectHome .dialogAiWorkerTimeout");
  const iconConfirm = dialog.querySelector(".iconConfirm");
  iconConfirm.addEventListener("click", (_) => {
    dialog.close();
  });
  dialog.addEventListener("close", (_) => {
    resetGame(domBoardState, loggerWriter);
    dialog.close();
  });
  dialog.showModal();
}

export {
  enableBoardEvents,
  handleHoveredCellIn,
  handleHoveredCellOut,
  prepareMoveForCell,
  discardMoveForCell,
  playUserMove,
  resetGame,
};
