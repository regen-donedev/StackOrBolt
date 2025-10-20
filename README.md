# StackOrBolt

A classic two player board game with an ai opponent.
<a href="https://regen-donedev.github.io/StackOrBolt/">Play online</a>

## Game Rules

Move a piece one or two cells forward or sideward.
You can wraparound the board for sideward moves,
but two consecutive sideward moves are not allowed.

<img src="./images/intro1.png" height="200"/>

To conquer opponent material, simply stack your
piece above the opponent's and its yours (for now).

<img src="./images/intro2.png" height="100"/>

By default, stacked pieces or **"towers"** are limited to three stones in total.
If the max stack size exceeds, all obsolete stones
are removed from the board in a FIFO manner and the opponent's will be  
credited to the player's vault.  
All stones for a tower are glued persistently and regarded as one single piece.
When a piece (tower or single stone) reaches the opposite side of the board,
its vertical movement is reversed (it begins moving backward).
If that piece reaches the end of the board again, **the safety zone**,
the player has successfully secured it and it will be removed from the board.

<img src="./images/intro3.png" height="200"/>

## Game End

The game ends if a player has conquered all opponent pieces
or secured all of his own.

### Additional distinct winning rules by default

- The player securing the first piece wins
- One player has at least 6 opponent stones credited in the vault

<img src="./images/intro4.png" height="200"/>

## Settings

The heuristic score algorithm for the Alpha-beta pruning evaluation function
can be optimized by adjusting the weights for the following strategies.
A configuration change for the winning rules may necessitate such customizations.

### Safety zone proximity

- **Material advantage:** Apply weights for each tower in reverse movement,
  depending on the distance (number of cells left) to reach the safety zone.
  More towers in reverse movement or a lesser distance may yield to a higher score.
- **Positional advantage:** Apply a weight to the difference of the
  total distance between both players for all towers in reverse movement. Even if one player has only
  one tower left, a win might still be possible by reaching the safety zone first.
- **Defensive factor:** The opponent player may get a higher score on equal
  conditions, this could prevent a positional advantage.

### General material advantage

- **Conquered material:** Apply a total weight to the difference of all owning
  and opponent's pieces. A higher weight may yield to a state where all
  the opponet's material will be conquered.
- **Vault credit accounting:** If you stack onto an opponent tower
  where the stack size limit exceeds, the removed opponent stones are
  credited to the player's own vault.
  Apply a total weight to the difference of all
  credited conquered opponent stones in the vault for both players.
  This could potentially yield to an earlier winning situation.

## Game replay

For each move the current game state gets logged to an IndexedDB object store.
You can upload an old game and replay after a specific move.

<img src="./images/intro5.png" height="200"/>

<img src="./images/intro6.png" height="200"/>
