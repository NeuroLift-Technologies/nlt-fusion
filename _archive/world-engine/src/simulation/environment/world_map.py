"""
Spatial World Map

Manages the discrete grid system for the simulation.
Provides spatial indexing, queries (e.g., finding nearby entities),
and pathfinding for agents navigating the environment.
"""

from typing import List, Dict, Tuple, Optional
import heapq
from .ecs import Registry, Position, Entity, Collider

class GridManager:
    """
    Manages a discrete 2D grid representation of the world.
    Responsible for bounds checking, spatial queries, and pathfinding.

    Maintains a positional index so queries and pathfinding stay cheap.
    The index is rebuilt from the registry whenever it is invalidated;
    systems that move entities should call `update_entity_position` so the
    index stays incremental.
    """

    def __init__(self, width: int = 100, height: int = 100, registry: Optional[Registry] = None):
        self.width = width
        self.height = height
        self.registry = registry
        # Cell membership is insertion-ordered (dict-backed) for determinism
        self._index: Optional[Dict[Tuple[int, int], Dict[Entity, None]]] = None

    def in_bounds(self, x: int, y: int) -> bool:
        """Check if coordinates are within the grid bounds."""
        return 0 <= x < self.width and 0 <= y < self.height

    def invalidate_index(self) -> None:
        """Force a rebuild of the positional index on next query."""
        self._index = None

    def _ensure_index(self) -> Dict[Tuple[int, int], Dict[Entity, None]]:
        if self._index is None:
            index: Dict[Tuple[int, int], Dict[Entity, None]] = {}
            if self.registry:
                for entity in self.registry.get_entities_with(Position):
                    pos = self.registry.get_component(entity, Position)
                    if pos:
                        index.setdefault((pos.x, pos.y), {})[entity] = None
            self._index = index
        return self._index

    def update_entity_position(self, entity: Entity, old_x: int, old_y: int,
                               new_x: int, new_y: int) -> None:
        """Incrementally move an entity in the positional index."""
        if self._index is None:
            return  # Index will be rebuilt lazily with fresh positions
        old_key = (old_x, old_y)
        cell = self._index.get(old_key)
        if cell is not None:
            cell.pop(entity, None)
            if not cell:
                del self._index[old_key]  # Don't accumulate empty cells
        self._index.setdefault((new_x, new_y), {})[entity] = None

    def get_entities_at(self, x: int, y: int) -> List[Entity]:
        """Find all entities currently at a specific coordinate."""
        if not self.registry:
            return []
        return list(self._ensure_index().get((x, y), ()))

    def get_entities_in_radius(self, center_x: int, center_y: int, radius: int) -> List[Entity]:
        """Find all entities within a Chebyshev distance radius (square radius)."""
        if not self.registry:
            return []

        index = self._ensure_index()
        result = []
        for x in range(center_x - radius, center_x + radius + 1):
            for y in range(center_y - radius, center_y + radius + 1):
                result.extend(index.get((x, y), ()))
        return result

    def is_walkable(self, x: int, y: int) -> bool:
        """
        Determine if a grid cell can be walked into.
        Returns False if out of bounds or occupied by a blocking entity.
        """
        if not self.in_bounds(x, y):
            return False

        for entity in self.get_entities_at(x, y):
            if self.registry and self.registry.has_component(entity, Collider):
                return False

        return True

    def find_path(self, start_x: int, start_y: int, goal_x: int, goal_y: int) -> List[Tuple[int, int]]:
        """
        A* pathfinding implementation on the 2D grid.
        Returns a list of (x, y) coordinates representing the path, or empty list if no path.
        """
        if not self.in_bounds(start_x, start_y) or not self.in_bounds(goal_x, goal_y):
            return []

        # A solid goal is unreachable — agents approach objects via an
        # adjacent walkable tile (AgentInterface.move_adjacent_to), never by
        # standing on them.
        if not self.is_walkable(goal_x, goal_y):
            return []

        frontier: List[Tuple[float, int, int]] = []
        heapq.heappush(frontier, (0, start_x, start_y))
        came_from: Dict[Tuple[int, int], Optional[Tuple[int, int]]] = {}
        cost_so_far: Dict[Tuple[int, int], float] = {}
        
        start = (start_x, start_y)
        goal = (goal_x, goal_y)
        
        came_from[start] = None
        cost_so_far[start] = 0.0
        
        while frontier:
            _, current_x, current_y = heapq.heappop(frontier)
            current = (current_x, current_y)
            
            if current == goal:
                break
                
            # Check neighbors (4-way movement)
            neighbors = [
                (current_x + 1, current_y),
                (current_x - 1, current_y),
                (current_x, current_y + 1),
                (current_x, current_y - 1)
            ]
            
            for next_x, next_y in neighbors:
                next_node = (next_x, next_y)

                if not self.is_walkable(next_x, next_y):
                    continue
                    
                new_cost = cost_so_far[current] + 1.0 # Cost is 1 per step
                
                if next_node not in cost_so_far or new_cost < cost_so_far[next_node]:
                    cost_so_far[next_node] = new_cost
                    priority = new_cost + self._heuristic(goal_x, goal_y, next_x, next_y)
                    heapq.heappush(frontier, (priority, next_x, next_y))
                    came_from[next_node] = current
                    
        # Reconstruct path
        if goal not in came_from:
            return [] # No path found
            
        path = []
        current = goal
        while current != start:
            path.append(current)
            current = came_from[current]  # type: ignore[assignment]
        path.append(start)
        path.reverse()
        
        return path[1:] # Return path excluding the start node

    def _heuristic(self, x1: int, y1: int, x2: int, y2: int) -> float:
        """Manhattan distance heuristic for A*."""
        return abs(x1 - x2) + abs(y1 - y2)
