export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

export function segmentIntersectsBoxInterior(
  start: Point,
  end: Point,
  box: Box,
): boolean {
  if (start.y === end.y) {
    return start.y > box.y
      && start.y < box.y + box.height
      && Math.max(Math.min(start.x, end.x), box.x)
        < Math.min(Math.max(start.x, end.x), box.x + box.width);
  }
  if (start.x === end.x) {
    return start.x > box.x
      && start.x < box.x + box.width
      && Math.max(Math.min(start.y, end.y), box.y)
        < Math.min(Math.max(start.y, end.y), box.y + box.height);
  }
  return true;
}

export function pathsConflict(
  first: ReadonlyArray<Point>,
  second: ReadonlyArray<Point>,
): boolean {
  for (let left = 1; left < first.length; left += 1) {
    for (let right = 1; right < second.length; right += 1) {
      const firstStart = first[left - 1];
      const firstEnd = first[left];
      const secondStart = second[right - 1];
      const secondEnd = second[right];
      if (
        firstStart !== undefined
        && firstEnd !== undefined
        && secondStart !== undefined
        && secondEnd !== undefined
        && orthogonalSegmentsConflict(
          firstStart,
          firstEnd,
          secondStart,
          secondEnd,
        )
      ) {
        return true;
      }
    }
  }
  return false;
}

function orthogonalSegmentsConflict(
  firstStart: Point,
  firstEnd: Point,
  secondStart: Point,
  secondEnd: Point,
): boolean {
  const firstHorizontal = firstStart.y === firstEnd.y;
  const secondHorizontal = secondStart.y === secondEnd.y;
  if (firstHorizontal && secondHorizontal) {
    return firstStart.y === secondStart.y
      && rangesOverlap(
        firstStart.x,
        firstEnd.x,
        secondStart.x,
        secondEnd.x,
      );
  }
  if (!firstHorizontal && !secondHorizontal) {
    return firstStart.x === secondStart.x
      && rangesOverlap(
        firstStart.y,
        firstEnd.y,
        secondStart.y,
        secondEnd.y,
      );
  }
  const horizontalStart = firstHorizontal ? firstStart : secondStart;
  const horizontalEnd = firstHorizontal ? firstEnd : secondEnd;
  const verticalStart = firstHorizontal ? secondStart : firstStart;
  const verticalEnd = firstHorizontal ? secondEnd : firstEnd;
  return verticalStart.x > Math.min(horizontalStart.x, horizontalEnd.x)
    && verticalStart.x < Math.max(horizontalStart.x, horizontalEnd.x)
    && horizontalStart.y > Math.min(verticalStart.y, verticalEnd.y)
    && horizontalStart.y < Math.max(verticalStart.y, verticalEnd.y);
}

function rangesOverlap(
  firstStart: number,
  firstEnd: number,
  secondStart: number,
  secondEnd: number,
): boolean {
  return Math.max(
    Math.min(firstStart, firstEnd),
    Math.min(secondStart, secondEnd),
  ) < Math.min(
    Math.max(firstStart, firstEnd),
    Math.max(secondStart, secondEnd),
  );
}
