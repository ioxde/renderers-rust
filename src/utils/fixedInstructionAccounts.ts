import {
    type CamelCaseString,
    type InstructionAccountNode,
    type InstructionNode,
    isNode,
    type Node,
    type PdaNode,
    type PdaValueNode,
    type ProgramNode,
} from '@codama/nodes';
import { findProgramNodeFromPath, getLastNodeFromPath, LinkableDictionary, type NodePath } from '@codama/visitors-core';

import { computePdaAddress } from './computePda';

/** The account name `getCommonInstructionAccountDefaultRules` matches to invent a program ID default. */
const SYNTHETIC_PROGRAM_ID_ACCOUNT = 'programId';

/**
 * The base58 address an instruction account is pinned to at generation time, or `undefined` when only
 * the caller knows it. Ask here rather than re-deriving the decision, or a builder and its account
 * metas disagree about which accounts the caller still supplies.
 */
export function getFixedInstructionAccountAddress(
    account: InstructionAccountNode,
    instructionPath: NodePath<InstructionNode>,
    linkables: LinkableDictionary,
): string | undefined {
    const instruction = getLastNodeFromPath(instructionPath);
    const program = findProgramNodeFromPath(instructionPath);
    if (!program) return undefined;

    if (instructionHasResolver(instruction)) return undefined;

    // A pinned address says nothing about who signs; the caller still has to hand one over.
    if (account.isSigner !== false) return undefined;

    const defaultValue = account.defaultValue;
    if (!defaultValue) return undefined;

    // Only the input can ask for omission, and `None` emits the program id or drops the account per
    // `optionalAccountStrategy` — a meta no pinned address reproduces.
    if (account.isOptional) return undefined;

    if (hasSyntheticDefault(account)) return undefined;

    const address = resolveFixedAddress(account, instructionPath, linkables, program);
    if (address === undefined) return undefined;

    if (instructionReadsAccount(instruction, account.name)) return undefined;

    return address;
}

/**
 * Whether the builder can drop an account's input because its address is settled at generation time.
 * Defined as `!!`{@link getFixedInstructionAccountAddress} so the two can never disagree.
 */
export function isInstructionAccountFixedAtGenerationTime(
    account: InstructionAccountNode,
    instructionPath: NodePath<InstructionNode>,
    linkables: LinkableDictionary,
): boolean {
    return !!getFixedInstructionAccountAddress(account, instructionPath, linkables);
}

/**
 * Whether `getCommonInstructionAccountDefaultRules` guessed the default from the account's *name*,
 * leaving it parametric — an unconstrained `token_program` must still accept Token-2022. Only a real
 * `address =` constraint camelCases the account's own name onto the node as its identifier.
 */
function hasSyntheticDefault(account: InstructionAccountNode): boolean {
    const defaultValue = account.defaultValue;
    if (!defaultValue) return false;
    // The `program_id` rule is the one heuristic with no identifier to compare, so the name it
    // matched is the only evidence left.
    if (isNode(defaultValue, 'programIdValueNode')) return account.name === SYNTHETIC_PROGRAM_ID_ACCOUNT;
    if (!isNode(defaultValue, 'publicKeyValueNode')) return false;
    return defaultValue.identifier !== account.name;
}

function resolveFixedAddress(
    account: InstructionAccountNode,
    instructionPath: NodePath<InstructionNode>,
    linkables: LinkableDictionary,
    program: ProgramNode,
): string | undefined {
    const defaultValue = account.defaultValue;
    if (!defaultValue) return undefined;
    if (isNode(defaultValue, 'publicKeyValueNode')) {
        return defaultValue.publicKey || undefined;
    }
    if (isNode(defaultValue, 'programIdValueNode')) {
        return program.publicKey || undefined;
    }
    if (isNode(defaultValue, 'programLinkNode')) {
        return linkables.get([...instructionPath, defaultValue])?.publicKey || undefined;
    }
    if (isNode(defaultValue, 'pdaValueNode')) {
        return resolveFixedPdaAddress(defaultValue, instructionPath, linkables, program);
    }
    return undefined;
}

/**
 * The address a PDA default folds to. {@link computePdaAddress} refuses any `variablePdaSeedNode`, so a
 * PDA the caller parameterises never folds even where this use-site binds every seed to a constant —
 * the finder the builder calls still takes those seeds as arguments.
 */
function resolveFixedPdaAddress(
    pdaValue: PdaValueNode,
    instructionPath: NodePath<InstructionNode>,
    linkables: LinkableDictionary,
    program: ProgramNode,
): string | undefined {
    const pda: PdaNode | undefined = isNode(pdaValue.pda, 'pdaLinkNode')
        ? linkables.get([...instructionPath, pdaValue.pda])
        : pdaValue.pda;
    if (!pda) return undefined;
    // A use-site program reference is settled only where Codama pinned the resolved address onto the
    // `PdaNode`; without a pin the deriving program is a runtime input.
    if (pdaValue.programId && !pda.programId) return undefined;
    const programAddress = pda.programId ?? program.publicKey;
    if (!programAddress) return undefined;
    return computePdaAddress(pda.seeds ?? [], programAddress) ?? undefined;
}

/**
 * Whether anything else in the instruction derives from the account: dropping its input would drop
 * what those derivations read. The associated-token program is the motivating case — its
 * `tokenProgram` is a seed of the ATA, so Token-2022 yields a different and correct address.
 */
function instructionReadsAccount(instruction: InstructionNode, accountName: CamelCaseString): boolean {
    return someInstructionValue(instruction, value => {
        if (isNode(value, ['accountValueNode', 'accountBumpValueNode'])) return value.name === accountName;
        if (isNode(value, 'accountFieldValueNode')) return value.account === accountName;
        return false;
    });
}

/** A resolver body is opaque to the renderer, so it must be assumed to read every account. */
function instructionHasResolver(instruction: InstructionNode): boolean {
    return someInstructionValue(instruction, value => isNode(value, 'resolverValueNode'));
}

/**
 * Walks every contextual value an instruction holds, recursing through the two nodes that nest other
 * values. One walker, so the account-read and resolver scans can only ever look at the same set.
 */
function someInstructionValue(instruction: InstructionNode, predicate: (value: Node) => boolean): boolean {
    const walk = (value: Node | undefined): boolean => {
        if (!value) return false;
        if (predicate(value)) return true;
        if (isNode(value, 'pdaValueNode')) {
            return (value.seeds ?? []).some(seed => walk(seed.value)) || walk(value.programId);
        }
        if (isNode(value, 'conditionalValueNode')) {
            return walk(value.condition) || walk(value.ifTrue) || walk(value.ifFalse);
        }
        return false;
    };

    return [
        ...(instruction.accounts ?? []).map(account => account.defaultValue),
        ...(instruction.arguments ?? []).map(argument => argument.defaultValue),
        ...(instruction.extraArguments ?? []).map(argument => argument.defaultValue),
        ...(instruction.byteDeltas ?? []).map(byteDelta => byteDelta.value),
        ...(instruction.remainingAccounts ?? []).map(remainingAccounts => remainingAccounts.value),
    ].some(walk);
}
