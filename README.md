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
If the tower reaches that end of the board again,
you have successfully secured it and it will be removed from the board.

<img src="./images/intro3.png" height="200"/>

## Game End

The game ends if a player has conquered all opponent material
or secured all of his own towers.

### Additional winning rules are configured by default

- The player for the first secured tower wins
- **OR**
- The player that has at least 6 opponent stones credited in the vault

