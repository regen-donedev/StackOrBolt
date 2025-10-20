# StackOrBolt

A classic two player board game with an ai opponent.

<h1><a href="https://regen-donedev.github.io/StackOrBolt/">Play online on github pages</a></h1>

## Game Rules

Move a piece one or two cells forward or sideward.
You can wraparound the board for sideward moves,
but two consecutive sideward moves are not allowed.

<img src="./images/intro1.png" height="200"/>

To conquer opponent material, simply stack your
piece above the opponent's and its yours (for now).

<img src="./images/intro2.png" height="100"/>

Stacked pieces or "towers" are limited to three stones in total.
If the max stack size exceeds, the obsolete stones
are removed from the board in a FIFO manner and
credited to the player's vault.  
Towers are glued persistently and regarded as one single piece.
When a tower reaches the opposite side of the board,
its vertical movement is reversed (it begins moving backward).
If the tower reaches that end of the board again **- the safety zone -**,
you have successfully secured it and it will be removed from the board.

<img src="./images/intro3.png" height="200"/>

## Game End

The game ends if a player has conquered all opponent material
or secured all of his own towers.

### Additional distinct winning rules by default

- The player securing the first tower wins
- One player has at least 6 opponent stones credited in the vault

## Settings

The heuristic score algorithm for the Alpha-beta pruning evaluation function 
can be optimized by adjusting the weights for the following strategies.

### Safety zone proximity

- **Material advantage:** Apply weights for each tower in reverse movement,
  depending on the distance (number of cells left) to reach the safety zone.
  More towers in reverse movement or a lesser distance may yield to a higher score.
- **Positional advantage:** Apply a weight to the difference for the
  total distance for all towers in reverse movement. Even if one player has only 
  one tower left, a win might still be possible by reaching the safety zone first.
- **Defensive factor:** The opponent player may get a higher score on equal
  conditions for the towers in reverse movement.
  This could prevent a positional advantage.

### General material advantage

- **Conquered material:** Apply a total weight to the difference of all owning
  and opponent's pieces. A higher weight may yield to a state where all
  the opponet's material will be conquered.
- **Vault credit accounting:** If you stack onto an opponent tower
  where the stack size limit exceeds, the removed opponent stones are
  credited to the player's own vault.
  Apply a total weight to the difference of all
  credited conquered opponent stonens in the vault for both players. 
  This could potentially yield to an early winning situation.
  


