/**
 * @module MinimaxAB
 * @description This module implements the Minimax algorithm with Alpha-Beta Pruning.
 * It is used by the spawned Web Worker to find the best move for the AI opponent.
 * @property {number} max_search_depth - The maximum search depth for the Minimax algorithm.
 * @requires module:GameState
 * @requires module:GameLogic
 * @exports findBestMove - Find the next best ai move for the bot
 */
import { checkWin, getAllPossibleMoves } from "./GameLogic.js";
import { BoardState, Move } from "./GameState.js";
let cachedSettingsState;

/**
 * If a terminal state in the minimax recursive search tree is reached
 * (terminal node (win or loss) or maximum search depth),
 * this function returns a score for the current board state.
 * The score is positive for the maximizing player (bot) and negative for the minimizing player (user).
 * If the maximum search depth is reached, a heuristic score is calculated
 * based on the number of conquered towers and towers in reverse movement reaching the safety zone.
 *
 * @param {BoardState} boardState
 * @param {number} depth
 * @returns {number|null}
 */
function getTerminalNodeState(boardState, depth) {
  const playerBot = boardState.playerState.twoPlayer.find(
    (player) => player.isMaximizing === true
  );
  const playerUser = boardState.playerState.twoPlayer.find(
    (player) => player.isMaximizing === false
  );
  if (checkWin(boardState, playerBot, cachedSettingsState)) {
    return Infinity;
  }
  if (checkWin(boardState, playerUser, cachedSettingsState)) {
    return -Infinity;
  }
  if (depth === Number(cachedSettingsState.searchRules.settings.depth)) {
    let botTowers = 0;
    let userTowers = 0;
    let botTowerSafetyWeight = 0;
    let userTowerSafetyWeight = 0;
    let botTowerTotalSafetyDistance = 0;
    let userTowerTotalSafetyDistance = 0;
    let score = 0;
    boardState.cells.forEach((cell) => {
      if (cell.svgLayout.at(-1) === playerBot.id) {
        botTowers++;
        if (
          cachedSettingsState.winningRules.settings.safetyZone > 0 &&
          cell.dot === true
        ) {
          const rowDistance = 5 - cell.row;
          botTowerTotalSafetyDistance += rowDistance;
          switch (rowDistance) {
            case 1:
              botTowerSafetyWeight +=
                cachedSettingsState.safetyZoneProximity.settings
                  .weightRowDistance1;
              break;
            case 2:
              botTowerSafetyWeight +=
                cachedSettingsState.safetyZoneProximity.settings
                  .weightRowDistance2;
              break;
            case 3:
              botTowerSafetyWeight +=
                cachedSettingsState.safetyZoneProximity.settings
                  .weightRowDistance3;
              break;
            case 4:
              botTowerSafetyWeight +=
                cachedSettingsState.safetyZoneProximity.settings
                  .weightRowDistance4;
              break;
            case 5:
              botTowerSafetyWeight +=
                cachedSettingsState.safetyZoneProximity.settings
                  .weightRowDistance5;
              break;
            default:
              throw new Error("Evaluation error for invalid material position");
          }
        }
      }
      if (cell.svgLayout.at(-1) === playerUser.id) {
        userTowers++;
        if (
          cachedSettingsState.winningRules.settings.safetyZone > 0 &&
          cell.dot === true
        ) {
          const rowDistance = cell.row;
          userTowerTotalSafetyDistance += rowDistance;
          switch (rowDistance) {
            case 1:
              userTowerSafetyWeight +=
                cachedSettingsState.safetyZoneProximity.settings
                  .weightRowDistance1;
              break;
            case 2:
              userTowerSafetyWeight +=
                cachedSettingsState.safetyZoneProximity.settings
                  .weightRowDistance2;
              break;
            case 3:
              userTowerSafetyWeight +=
                cachedSettingsState.safetyZoneProximity.settings
                  .weightRowDistance3;
              break;
            case 4:
              userTowerSafetyWeight +=
                cachedSettingsState.safetyZoneProximity.settings
                  .weightRowDistance4;
              break;
            case 5:
              userTowerSafetyWeight +=
                cachedSettingsState.safetyZoneProximity.settings
                  .weightRowDistance5;
              break;
            default:
              throw new Error("Evaluation error for invalid material position");
          }
        }
      }
    });
    // Increase the heuristic score for Conquered Material Advantage
    // by applying the final weight for the total difference.
    score +=
      (botTowers -
        cachedSettingsState.materialAdvantageConquered.settings.opponentWeight *
          userTowers) *
      cachedSettingsState.materialAdvantageConquered.settings.totalWeight;
    // Increase the heuristic score for Safety Zone Proximity
    // by applying the final weight for the total difference.
    if (cachedSettingsState.winningRules.settings.safetyZone > 0) {
      score += Math.round(
        (botTowerSafetyWeight -
          cachedSettingsState.safetyZoneProximity.settings.opponentWeight *
            userTowerSafetyWeight) *
          cachedSettingsState.safetyZoneProximity.settings.totalWeight
      );
      // If the total distance of all towers in reverse movement is lesser than 5 rows,
      // this means that all towers are already in reverse movement and a win is just
      // 2 moves away.
      if (userTowerTotalSafetyDistance > 4) {
        userTowerTotalSafetyDistance = 0;
      } else {
        userTowerTotalSafetyDistance = 1;
      }
      if (botTowerTotalSafetyDistance > 4) {
        botTowerTotalSafetyDistance = 0;
      } else {
        botTowerTotalSafetyDistance = 1;
      }
      score +=
        (botTowerTotalSafetyDistance -
          userTowerTotalSafetyDistance *
            cachedSettingsState.safetyZoneProximity.settings.opponentWeight) *
        cachedSettingsState.safetyZoneProximity.settings
          .safetyZoneTotalDistance *
        cachedSettingsState.safetyZoneProximity.settings.totalWeight;
    }
    // Increase the heuristic score for Accounted Material Advantage
    // by applying the final weight for the total difference.
    if (cachedSettingsState.winningRules.settings.materialOpponent > 0) {
      score +=
        (playerBot.vault.opponent - playerUser.vault.opponent) *
        cachedSettingsState.materialAdvantageAccounted.settings.totalWeight;
    }

    return score;
  }
  return null;
}

/**
 * Implements the Minimax algorithm with Alpha-Beta Pruning.
 *
 * @param {BoardState} board_state  - A deep cloned BoardState instance without DOM relations representing
 *                                    the board state for the current minimax search tree recursion.
 * @param {number} depth The current depth in the game tree.
 * @param {number} alpha The alpha value (best score found so far for the maximizing player).
 * @param {number} beta The beta value (best score found so far for the minimizing player).
 * @returns {number} The optimal score for the current board state.
 */
function minimax(boardState, depth, alpha, beta) {
  const currentPlayer = boardState.playerState.twoPlayer.find(
    (player) => player.turn === true
  );
  const evaluation = getTerminalNodeState(boardState, depth);
  if (evaluation !== null) {
    return evaluation;
  }

  if (currentPlayer.isMaximizing === true) {
    let max_eval = -Infinity;
    const possibleMoves = getAllPossibleMoves(boardState, currentPlayer);
    for (let i = 0, len = possibleMoves.length; i < len; i++) {
      let move = possibleMoves[i];
      let loggedMove = new Move(
        move[0].cloneInstance(),
        move[1].cloneInstance(),
        boardState.playerState.cloneInstance()
      );
      boardState.applyMoveAndTurn(
        move[0],
        move[1],
        cachedSettingsState.winningRules.settings.maxStackSize
      );
      const evaluate = minimax(boardState, depth + 1, alpha, beta);
      boardState.undoMove(loggedMove);
      max_eval = Math.max(max_eval, evaluate);
      alpha = Math.max(alpha, max_eval);
      // Alpha-Beta Pruning: If beta is less than or equal to alpha,
      // it means the minimizing player already has a better option higher up.
      // So, this branch won't be chosen by the minimizing player.
      if (beta <= alpha) {
        break; // Prune the remaining branches
      }
    }
    return max_eval;
  } else {
    // Minimizing player
    let min_eval = Infinity;
    const possibleMoves = getAllPossibleMoves(boardState, currentPlayer);
    for (let i = 0, len = possibleMoves.length; i < len; i++) {
      let move = possibleMoves[i];
      let loggedMove = new Move(
        move[0].cloneInstance(),
        move[1].cloneInstance(),
        boardState.playerState.cloneInstance()
      );
      boardState.applyMoveAndTurn(
        move[0],
        move[1],
        cachedSettingsState.winningRules.settings.maxStackSize
      );
      const evaluate = minimax(boardState, depth + 1, alpha, beta);
      boardState.undoMove(loggedMove);
      min_eval = Math.min(min_eval, evaluate);
      beta = Math.min(beta, min_eval); // Update beta
      // Alpha-Beta Pruning: If beta is less than or equal to alpha,
      // it means the maximizing player already has a better option higher up.
      // So, this branch won't be reached by the maximizing player.
      if (beta <= alpha) {
        break; // Prune the remaining branches
      }
    }
    return min_eval;
  }
}

/**
 * Finds the best move for the maximizing player (bot) using Minimax with Alpha-Beta Pruning.
 * @param {BoardState} boardState A deep cloned BoardState instance without DOM relations representing
 *                                the actual state of the game board from the browser UI.
 * @returns {GridCell[]} The source and target coordinates for the best move, or null if no moves are possible.
 */
function findBestMove(boardState, settings) {
  cachedSettingsState = structuredClone(settings);
  const player = boardState.playerState.twoPlayer.find(
    (player) => player.turn === true
  );
  if (player.isMaximizing === false) {
    throw new Error(
      "findBestMove must be invoked for the bot AI opponent (maximizing player)."
    );
  }
  let best_score = -Infinity;
  let best_move = null;
  const possibleMoves = getAllPossibleMoves(boardState, player);
  if (possibleMoves.length === 0) {
    throw new Error("could not determine possible moves");
  }
  // Initial call to minimax with alpha = -Infinity and beta = +Infinity
  for (let i = 0, len = possibleMoves.length; i < len; i++) {
    const move = possibleMoves[i];
    const loggedMove = new Move(
      move[0].cloneInstance(),
      move[1].cloneInstance(),
      boardState.playerState.cloneInstance()
    );
    boardState.applyMoveAndTurn(
      move[0],
      move[1],
      cachedSettingsState.winningRules.settings.maxStackSize
    );
    let score_for_this_move = minimax(boardState, 0, -Infinity, Infinity);
    boardState.undoMove(loggedMove);
    if (score_for_this_move > best_score) {
      best_score = score_for_this_move;
      best_move = move;
    }
  }
  return best_move === null ? possibleMoves[0] : best_move;
}

export { findBestMove };
