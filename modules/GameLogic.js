/**
 * @module GameLogic
 * @description This module contains the core game logic for the TowerHunt game,
 * including legal move topology, move execution, game state updates,
 * player turn switching, move validation, and win condition checks.
 * @requires module:GameState
 * @requires module:ConfigState
 * @exports playMove
 * @exports getLocalMoves
 * @exports getAllPossibleMoves
 * @exports checkWin
 * @exports switchPlayer
 */
import {
  PLAYER_ID,
  GridCell,
  BoardState,
  Player,
  PlayerState,
} from "./GameState.js";
import { Settings } from "./ConfigState.js";
/**
 * Update all game state related properties for the source and target GridCell instances,
 * resulting from this move. The target GridCell is either empty
 * or represents a tower of stacked stones currently owned
 * by the opponent player. All stones from the source GridCell are stacked
 * on top of the target GridCell tower in a preserving order.
 * Only the top three stones of the target tower survive,
 * the rest are moved from the board and accounted to the vault of the current player.
 * Finally, if the player has moved horizontally, the lastHorizontal property
 * of the player is updated to lock the horizontal movement for the next turn only.
 * @param {GridCell} srcInst
 * @param {GridCell} tgtInst
 * @param {BoardState} boardState
 * @returns {void}
 */
function playMove(srcInst, tgtInst, boardState, maxStackSize) {
  const player = boardState.playerState.twoPlayer.find(
    (player) => player.turn === true
  );
  stackTowers(srcInst, tgtInst, player, maxStackSize);
  tgtInst.direction = srcInst.direction;
  tgtInst.dot = srcInst.dot;
  if (
    srcInst.svgLayout.at(-1) === PLAYER_ID.USER &&
    tgtInst.row === 5 &&
    srcInst.dot === false
  ) {
    tgtInst.direction *= -1;
    tgtInst.dot = true;
  }
  if (
    srcInst.svgLayout.at(-1) === PLAYER_ID.BOT &&
    tgtInst.row === 0 &&
    srcInst.dot === false
  ) {
    tgtInst.direction *= -1;
    tgtInst.dot = true;
  }
  if (
    srcInst.svgLayout.at(-1) === PLAYER_ID.USER &&
    tgtInst.row === 0 &&
    srcInst.dot === true
  ) {
    tgtInst.svgLayout = [];
    tgtInst.direction = 0;
    tgtInst.dot = false;
    player.safetyTower += 1;
  }
  if (
    srcInst.svgLayout.at(-1) === PLAYER_ID.BOT &&
    tgtInst.row === 5 &&
    srcInst.dot === true
  ) {
    tgtInst.svgLayout = [];
    tgtInst.direction = 0;
    tgtInst.dot = false;
    player.safetyTower += 1;
  }
  srcInst.svgLayout = [];
  srcInst.direction = 0;
  srcInst.dot = false;
  tgtInst.updateSvg();
  srcInst.updateSvg();
  player.lastHorizontal = tgtInst.row === srcInst.row;
  return;
}

/**
 * Returns a list of valid neighboring cell instances that the player can move to from the given cell.
 *
 * @param {GridCell} cellInst - The current cell instance. Should have properties: column, row, direction, svgLayout.
 * @param {Player} player - The player object. Should have property: lastHorizontal (boolean).
 * @param {BoardState} boardState - The current state of the board. Should have property: cells (array of cell instances).
 * @returns {GridCell[]} An array of neighboring GridCell instances that are valid move candidates.
 */
function getLocalMoves(cellInst, player, boardState) {
  const candidates = [];
  const x = parseInt(cellInst.column);
  const y = parseInt(cellInst.row);
  const dir = parseInt(cellInst.direction);
  let neighbor = boardState.cells.find(
    (inst) => inst.row === y + dir && inst.column === x
  );
  if (neighbor && neighbor.svgLayout.at(-1) !== cellInst.svgLayout.at(-1)) {
    candidates.push(neighbor);
  }
  neighbor = boardState.cells.find(
    (inst) => inst.row === y + 2 * dir && inst.column === x
  );
  if (neighbor && neighbor.svgLayout.at(-1) !== cellInst.svgLayout.at(-1)) {
    candidates.push(neighbor);
  }
  if (player.lastHorizontal === false) {
    neighbor = boardState.cells.find(
      (inst) => inst.row === y && inst.column === (x + 5) % 6
    );
    if (neighbor && neighbor.svgLayout.at(-1) !== cellInst.svgLayout.at(-1)) {
      candidates.push(neighbor);
    }
    neighbor = boardState.cells.find(
      (inst) => inst.row === y && inst.column === (x + 4) % 6
    );
    if (neighbor && neighbor.svgLayout.at(-1) !== cellInst.svgLayout.at(-1)) {
      candidates.push(neighbor);
    }
    neighbor = boardState.cells.find(
      (inst) => inst.row === y && inst.column === (x + 7) % 6
    );
    if (neighbor && neighbor.svgLayout.at(-1) !== cellInst.svgLayout.at(-1)) {
      candidates.push(neighbor);
    }
    neighbor = boardState.cells.find(
      (inst) => inst.row === y && inst.column === (x + 8) % 6
    );
    if (neighbor && neighbor.svgLayout.at(-1) !== cellInst.svgLayout.at(-1)) {
      candidates.push(neighbor);
    }
  }
  return candidates;
}

/**
 * Generates all possible moves for the given player based on the current board state.
 *
 * @param {BoardState} boardState - The current BoardState of the game.
 * @param {Player} player - The Player for whom to generate possible moves.
 * @returns {GridCell[][]} An array of moves, where each move consists of a source cell and a target cell.
 */
function getAllPossibleMoves(boardState, player) {
  const allPossibleMoves = [];
  const owningTowerPlayer = boardState.cells.filter(
    (cell) => cell.svgLayout.length > 0 && cell.svgLayout.at(-1) === player.id
  );
  owningTowerPlayer.forEach((srcCell) => {
    getLocalMoves(srcCell, player, boardState).forEach((tgtCell) =>
      allPossibleMoves.push([srcCell, tgtCell])
    );
  });
  return allPossibleMoves;
}

/**
 * Stacks towers from the source cell onto the target cell according to game rules.
 *
 * - If no target tower exists, moves all stones from the source to the target cell.
 * - If the last elements of source and target towers differ, moves and pushes all stones from the source onto the target cell.
 * - If the target tower exceeds 3 elements, increments the appropriate player's vault and removes the bottom elements.
 *
 * @param {GridCell} srcCell - The source tower layout in the GridCell (array of elements to stack).
 * @param {GridCell} tgtCell - The target tower layout in the GridCell (array to stack onto).
 * @param {Player} player - The Player that makes this move.
 * @returns {void}
 */
function stackTowers(srcCell, tgtCell, player, maxStackSize) {
  if (srcCell.svgLayout.length === 0) {
    throw new Error("source cell has no tower");
  }
  if (tgtCell.svgLayout.length === 0) {
    tgtCell.svgLayout = [...srcCell.svgLayout];
    return;
  }
  if (srcCell.svgLayout.at(-1) !== tgtCell.svgLayout.at(-1)) {
    for (let i = 0, len = srcCell.svgLayout.length; i < len; i++) {
      tgtCell.svgLayout.push(srcCell.svgLayout[i]);
      if (tgtCell.svgLayout.length > maxStackSize) {
        let selfVal = player.vault.self;
        let opponentVal = player.vault.opponent;
        if (tgtCell.svgLayout.at(0) === player.id) {
          selfVal += 1;
        } else {
          opponentVal += 1;
        }
        player.vault = { self: selfVal, opponent: opponentVal };
        tgtCell.svgLayout.shift();
      }
    }
    return;
  } else {
    throw new Error("cannot stack towers of the same player");
  }
}

/**
 * This function is used to toggle the turn between two players in a two-player game
 *
 * @param {PlayerState} playerState - The state instance containing both player's information.
 * @returns {void}
 */
function switchPlayer(playerState) {
  playerState.twoPlayer.forEach((player) => {
    player.turn = player.turn === true ? false : true;
  });
}

/**
 * Determines if the current player has won the game.
 *
 * A player wins if:
 * - All opponent towers were conquered
 * - If at least 6 opponent stones are accounted in the vault
 * - If an owning tower in reverse movement reached the safety zone of the board.
 *
 * @param {BoardState} boardState - The current state of the game board.
 * @param {Player} player - The player object for whom to check the win condition.
 * @param {Settings | Object} settings - The current saved configuration.
 * @returns {boolean} True if the player has won, otherwise false.
 */
function checkWin(boardState, player, settings) {
  if (
    (settings.winningRules.settings.materialOpponent > 0 &&
      player.vault.opponent >=
        settings.winningRules.settings.materialOpponent) ||
    player.safetyTower >= settings.winningRules.settings.safetyZone
  ) {
    player.winner = true;
    return true;
  }
  const opponent = boardState.playerState.twoPlayer.find(
    (playerInst) => playerInst.id !== player.id
  );
  let opponentTower = boardState.cells.find(
    (cell) => cell.svgLayout.at(-1) === opponent.id
  );
  let owningTower = boardState.cells.find(
    (cell) => cell.svgLayout.at(-1) === player.id
  );
  opponentTower ??= null;
  owningTower ??= null;
  if (
    player.turn === false &&
    (opponentTower === null || owningTower === null)
  ) {
    player.winner = true;
    return true;
  }
  return false;
}

export { playMove, getLocalMoves, getAllPossibleMoves, checkWin, switchPlayer };
