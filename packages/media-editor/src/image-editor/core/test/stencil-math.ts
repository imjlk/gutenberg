/**
 * Internal dependencies
 */
import {
	computeShiftLockedResizeRect,
	type CropBounds,
	type ResizeDragState,
} from '../stencil-math';
import type { Size } from '../types';

const IMAGE: Size = { width: 1000, height: 500 };
const FULL_BOUNDS: CropBounds = { minX: 0, minY: 0, maxX: 1, maxY: 1 };

const START_RECT = { x: 0.2, y: 0.2, width: 0.4, height: 0.6 };

function makeDrag(
	handle: ResizeDragState[ 'handle' ],
	startX = 500,
	startY = 250
): ResizeDragState {
	return {
		handle,
		startX,
		startY,
		startRect: { ...START_RECT },
	};
}

describe( 'computeShiftLockedResizeRect', () => {
	describe( 'corner handles', () => {
		it( 'preserves the start rect ratio when dragging the SE corner outward', () => {
			const drag = makeDrag( 'se' );
			// Drag right by 200px and down by 50px — width is the bigger
			// pixel motion, so it drives.
			const rect = computeShiftLockedResizeRect(
				drag,
				700,
				300,
				IMAGE,
				FULL_BOUNDS
			);

			const startPixelRatio =
				( START_RECT.width * IMAGE.width ) /
				( START_RECT.height * IMAGE.height );
			const newPixelRatio =
				( rect.width * IMAGE.width ) / ( rect.height * IMAGE.height );

			expect( newPixelRatio ).toBeCloseTo( startPixelRatio, 5 );
			// SE drag anchors at the NW corner of the start rect.
			expect( rect.x ).toBeCloseTo( START_RECT.x, 5 );
			expect( rect.y ).toBeCloseTo( START_RECT.y, 5 );
		} );

		it( 'preserves the start rect ratio when dragging the NW corner inward', () => {
			const drag = makeDrag( 'nw' );
			const rect = computeShiftLockedResizeRect(
				drag,
				600,
				300,
				IMAGE,
				FULL_BOUNDS
			);

			const startPixelRatio =
				( START_RECT.width * IMAGE.width ) /
				( START_RECT.height * IMAGE.height );
			const newPixelRatio =
				( rect.width * IMAGE.width ) / ( rect.height * IMAGE.height );
			expect( newPixelRatio ).toBeCloseTo( startPixelRatio, 5 );
			// NW drag anchors at the SE corner of the start rect.
			expect( rect.x + rect.width ).toBeCloseTo(
				START_RECT.x + START_RECT.width,
				5
			);
			expect( rect.y + rect.height ).toBeCloseTo(
				START_RECT.y + START_RECT.height,
				5
			);
		} );
	} );

	describe( 'edge handles — symmetric expansion', () => {
		it( 'east edge: expands height symmetrically around the start rect center', () => {
			const drag = makeDrag( 'e' );
			// Expand width by 100px to the right.
			const rect = computeShiftLockedResizeRect(
				drag,
				600,
				250,
				IMAGE,
				FULL_BOUNDS
			);

			const startCenterY = START_RECT.y + START_RECT.height / 2;
			expect( rect.y + rect.height / 2 ).toBeCloseTo( startCenterY, 5 );
			// x-anchored to start.x.
			expect( rect.x ).toBeCloseTo( START_RECT.x, 5 );
			// Ratio preserved.
			const startPixelRatio =
				( START_RECT.width * IMAGE.width ) /
				( START_RECT.height * IMAGE.height );
			const newPixelRatio =
				( rect.width * IMAGE.width ) / ( rect.height * IMAGE.height );
			expect( newPixelRatio ).toBeCloseTo( startPixelRatio, 5 );
		} );

		it( 'north edge: expands width symmetrically around the start rect center', () => {
			const drag = makeDrag( 'n' );
			// Drag the top edge up by 50px (taller crop).
			const rect = computeShiftLockedResizeRect(
				drag,
				500,
				200,
				IMAGE,
				FULL_BOUNDS
			);

			const startCenterX = START_RECT.x + START_RECT.width / 2;
			expect( rect.x + rect.width / 2 ).toBeCloseTo( startCenterX, 5 );
			// Bottom edge stays anchored.
			expect( rect.y + rect.height ).toBeCloseTo(
				START_RECT.y + START_RECT.height,
				5
			);
			const startPixelRatio =
				( START_RECT.width * IMAGE.width ) /
				( START_RECT.height * IMAGE.height );
			const newPixelRatio =
				( rect.width * IMAGE.width ) / ( rect.height * IMAGE.height );
			expect( newPixelRatio ).toBeCloseTo( startPixelRatio, 5 );
		} );
	} );

	describe( 'bounds clamping', () => {
		it( 'east edge: clamps height to the symmetric bounds limit and shrinks width to keep ratio', () => {
			// Center-y of START_RECT is 0.5; tightest bounds are bounds.minY=0.4
			// and bounds.maxY=0.6 → max half-height = 0.1, so max height = 0.2.
			const tightBounds: CropBounds = {
				minX: 0,
				minY: 0.4,
				maxX: 1,
				maxY: 0.6,
			};
			const drag = makeDrag( 'e' );
			// Drag far right — height would otherwise exceed the bound.
			const rect = computeShiftLockedResizeRect(
				drag,
				1000,
				250,
				IMAGE,
				tightBounds
			);

			expect( rect.height ).toBeLessThanOrEqual( 0.2 + 1e-9 );
			// Centered around 0.5.
			expect( rect.y + rect.height / 2 ).toBeCloseTo( 0.5, 5 );
			const startPixelRatio =
				( START_RECT.width * IMAGE.width ) /
				( START_RECT.height * IMAGE.height );
			const newPixelRatio =
				( rect.width * IMAGE.width ) / ( rect.height * IMAGE.height );
			expect( newPixelRatio ).toBeCloseTo( startPixelRatio, 5 );
		} );
	} );
} );
