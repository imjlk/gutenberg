/**
 * WordPress dependencies
 */
import { isPhrasingContent, getPhrasingContentSchema } from '@wordpress/dom';

/**
 * Internal dependencies
 */
import { hasBlockSupport } from '..';
import { getRawTransforms } from './get-raw-transforms';
import type { NodeFilterFunction } from './types';

export function getBlockContentSchemaFromTransforms(
	transforms: any[],
	context?: string
) {
	const phrasingContentSchema = getPhrasingContentSchema( context );
	const schemaArgs = { phrasingContentSchema, isPaste: context === 'paste' };
	const schemas = transforms.map( ( { isMatch, blockName, schema } ) => {
		const hasAnchorSupport = hasBlockSupport( blockName, 'anchor' );

		schema = typeof schema === 'function' ? schema( schemaArgs ) : schema;

		// If the block does not has anchor support and the transform does not
		// provides an isMatch we can return the schema right away.
		if ( ! hasAnchorSupport && ! isMatch ) {
			return schema;
		}

		if ( ! schema ) {
			return {};
		}

		return Object.fromEntries(
			Object.entries( schema ).map( ( [ key, value ]: any[] ) => {
				let attributes = ( value as any ).attributes || [];
				// If the block supports the "anchor" functionality, it needs to keep its ID attribute.
				if ( hasAnchorSupport ) {
					attributes = [ ...attributes, 'id' ];
				}
				return [
					key,
					{
						...value,
						attributes,
						isMatch: isMatch ? isMatch : undefined,
					},
				];
			} )
		);
	} );

	function mergeTagNameSchemaProperties(
		objValue: any,
		srcValue: any,
		key: string
	) {
		switch ( key ) {
			case 'children': {
				if ( objValue === '*' || srcValue === '*' ) {
					return '*';
				}

				return { ...objValue, ...srcValue };
			}
			case 'attributes':
			case 'require': {
				return [ ...( objValue || [] ), ...( srcValue || [] ) ];
			}
			case 'isMatch': {
				// If one of the values being merge is undefined (matches everything),
				// the result of the merge will be undefined.
				if ( ! objValue || ! srcValue ) {
					return undefined;
				}
				// When merging two isMatch functions, the result is a new function
				// that returns if one of the source functions returns true.
				return ( ...args: any[] ) => {
					return objValue( ...args ) || srcValue( ...args );
				};
			}
		}
	}

	// A tagName schema is an object with children, attributes, require, and
	// isMatch properties.
	function mergeTagNameSchemas( a: any, b: any ) {
		for ( const key in b ) {
			a[ key ] = a[ key ]
				? mergeTagNameSchemaProperties( a[ key ], b[ key ], key )
				: { ...b[ key ] };
		}
		return a;
	}

	// A schema is an object with tagName schemas by tag name.
	function mergeSchemas( a: any, b: any ) {
		for ( const key in b ) {
			a[ key ] = a[ key ]
				? mergeTagNameSchemas( a[ key ], b[ key ] )
				: { ...b[ key ] };
		}
		return a;
	}

	return schemas.reduce( mergeSchemas, {} );
}

/**
 * Gets the block content schema, which is extracted and merged from all
 * registered blocks with raw transforms.
 *
 * @param context Set to "paste" when in paste context, where the
 *                schema is more strict.
 *
 * @return A complete block content schema.
 */
export function getBlockContentSchema( context?: string ) {
	return getBlockContentSchemaFromTransforms( getRawTransforms(), context );
}

/**
 * Checks whether HTML can be considered plain text. That is, it does not contain
 * any elements that are not line breaks, or it only contains a single non-semantic
 * wrapper element (span) with no semantic child elements.
 *
 * @param HTML The HTML to check.
 *
 * @return Whether the HTML can be considered plain text.
 */
export function isPlain( HTML: string ) {
	if ( ! /<(?!br[ />])/i.test( HTML ) ) {
		return true;
	}

	const doc = document.implementation.createHTMLDocument( '' );
	doc.body.innerHTML = HTML;

	if ( doc.body.children.length !== 1 ) {
		return false;
	}

	const wrapper = doc.body.children.item( 0 )!;

	const descendants = wrapper.getElementsByTagName( '*' );
	for ( let i = 0; i < descendants.length; i++ ) {
		if ( descendants.item( i )!.tagName !== 'BR' ) {
			return false;
		}
	}

	if ( wrapper.tagName !== 'SPAN' ) {
		return false;
	}

	return true;
}

/**
 * Checks whether HTML is purely decorative for the given plain text. That is,
 * the HTML contains only non-semantic wrapper elements (div, span, br) — typical
 * of source-code editors like VS Code that emit syntax-highlighted HTML — and
 * its text content matches the plain text. In that case the HTML carries no
 * structural information beyond what plain text already provides, so callers
 * can safely fall back to the plain text (e.g. to run Markdown conversion).
 *
 * @param HTML      The HTML to check.
 * @param plainText The accompanying plain text version.
 *
 * @return Whether the HTML is decorative-only for the given plain text.
 */
export function isDecorativeHTML( HTML: string, plainText: string ): boolean {
	if ( ! HTML || ! plainText ) {
		return false;
	}

	const doc = document.implementation.createHTMLDocument( '' );
	doc.body.innerHTML = HTML;

	const allowed = new Set( [ 'DIV', 'SPAN', 'BR' ] );
	const descendants = doc.body.getElementsByTagName( '*' );
	for ( let i = 0; i < descendants.length; i++ ) {
		if ( ! allowed.has( descendants.item( i )!.tagName ) ) {
			return false;
		}
	}

	// Strip all whitespace before comparing. The HTML may flatten line breaks
	// (e.g. each line wrapped in <div> with no inline newlines) while the plain
	// text preserves them, so whitespace is not a reliable distinguishing
	// signal here. Comparing only the non-whitespace characters reliably
	// detects HTML that is purely decorative for the given plain text.
	const stripWhitespace = ( value: string ) => value.replace( /\s+/g, '' );
	return (
		stripWhitespace( doc.body.textContent ?? '' ) ===
		stripWhitespace( plainText )
	);
}

export type { NodeFilterFunction } from './types';

/**
 * Given node filters, deeply filters and mutates a NodeList.
 *
 * @param nodeList The nodeList to filter.
 * @param filters  An array of functions that can mutate with the provided node.
 * @param doc      The document of the nodeList.
 * @param schema   The schema to use.
 */
export function deepFilterNodeList(
	nodeList: NodeList,
	filters: NodeFilterFunction[],
	doc: Document,
	schema?: Record< string, unknown >
) {
	Array.from( nodeList ).forEach( ( node ) => {
		deepFilterNodeList( node.childNodes, filters, doc, schema );

		filters.forEach( ( item ) => {
			// Make sure the node is still attached to the document.
			if ( ! doc.contains( node ) ) {
				return;
			}

			item( node, doc, schema );
		} );
	} );
}

/**
 * Given node filters, deeply filters HTML tags.
 * Filters from the deepest nodes to the top.
 *
 * @param HTML    The HTML to filter.
 * @param filters An array of functions that can mutate with the provided node.
 * @param schema  The schema to use.
 *
 * @return The filtered HTML.
 */
export function deepFilterHTML(
	HTML: string,
	filters: NodeFilterFunction[] = [],
	schema?: Record< string, unknown >
) {
	const doc = document.implementation.createHTMLDocument( '' );

	doc.body.innerHTML = HTML;

	deepFilterNodeList( doc.body.childNodes, filters, doc, schema );

	return doc.body.innerHTML;
}

/**
 * Gets a sibling within text-level context.
 *
 * @param node  The subject node.
 * @param which "next" or "previous".
 */
export function getSibling( node: Node, which: string ): Node | undefined {
	const sibling = ( node as any )[ `${ which }Sibling` ] as Node | undefined;

	if ( sibling && isPhrasingContent( sibling ) ) {
		return sibling;
	}

	const { parentNode } = node;

	if ( ! parentNode || ! isPhrasingContent( parentNode ) ) {
		return;
	}

	return getSibling( parentNode, which );
}
