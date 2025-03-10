import {
  bufferCV,
  callReadOnlyFunction,
  ClarityType,
  ClarityValue,
  cvToString,
  getAddressFromPrivateKey,
  getCVTypeString,
  hash160,
  makeRandomPrivKey,
  makeUnsignedContractCall,
  privateKeyToString,
  ResponseErrorCV,
  StacksTransaction,
  standardPrincipalCV,
  UnsignedContractCallOptions,
} from '@stacks/transactions';

import { StacksNetwork } from '@stacks/network';

import { bufferCVFromString, decodeFQN, getZonefileHash, uintCVFromBN } from './utils';

import BN from 'bn.js';

import { ChainID } from '@stacks/common';

export const BNS_CONTRACT_NAME = 'bns';

export const enum BnsContractAddress {
  mainnet = 'SP000000000000000000002Q6VF78',
  testnet = 'ST000000000000000000002AMW42H',
}

function getBnsContractAddress(network: StacksNetwork) {
  if (network.chainId === ChainID.Mainnet) return BnsContractAddress.mainnet;
  else if (network.chainId == ChainID.Testnet) return BnsContractAddress.testnet;
  else throw new Error(`Unexpected ChainID: ${network.chainId}`);
}

export interface PriceFunction {
  base: BN;
  coefficient: BN;
  b1: BN;
  b2: BN;
  b3: BN;
  b4: BN;
  b5: BN;
  b6: BN;
  b7: BN;
  b8: BN;
  b9: BN;
  b10: BN;
  b11: BN;
  b12: BN;
  b13: BN;
  b14: BN;
  b15: BN;
  b16: BN;
  nonAlphaDiscount: BN;
  noVowelDiscount: BN;
}

export interface BnsContractCallOptions {
  functionName: string;
  functionArgs: ClarityValue[];
  publicKey: string;
  network: StacksNetwork;
  attachment?: Buffer;
}

async function makeBnsContractCall(options: BnsContractCallOptions): Promise<StacksTransaction> {
  const txOptions: UnsignedContractCallOptions = {
    contractAddress: getBnsContractAddress(options.network),
    contractName: BNS_CONTRACT_NAME,
    functionName: options.functionName,
    functionArgs: options.functionArgs,
    publicKey: options.publicKey,
    validateWithAbi: false,
    network: options.network,
  };

  return makeUnsignedContractCall(txOptions);
}

export interface BnsReadOnlyOptions {
  functionName: string;
  functionArgs: ClarityValue[];
  senderAddress: string;
  network: StacksNetwork;
}

async function callReadOnlyBnsFunction(options: BnsReadOnlyOptions): Promise<ClarityValue> {
  return callReadOnlyFunction({
    contractAddress: getBnsContractAddress(options.network),
    contractName: BNS_CONTRACT_NAME,
    functionName: options.functionName,
    senderAddress: options.senderAddress,
    functionArgs: options.functionArgs,
    network: options.network,
  });
}

/**
 * Can register name options
 *
 * @param  {String} fullyQualifiedName - the fully qualified name ("name.namespace") to check
 * @param  {StacksNetwork} network - the Stacks blockchain network to use
 */
export interface CanRegisterNameOptions {
  fullyQualifiedName: string;
  network: StacksNetwork;
}

/**
 * Check if name can be registered
 *
 * @param {string} fullyQualifiedName - the fully qualified name to check
 * @param {StacksNetwork} network - the Stacks network to broadcast transaction to
 *
 * @returns {Promise} that resolves to true if the operation succeeds
 */
export async function canRegisterName({
  fullyQualifiedName,
  network,
}: CanRegisterNameOptions): Promise<boolean> {
  const bnsFunctionName = 'can-name-be-registered';
  const { subdomain, namespace, name } = decodeFQN(fullyQualifiedName);
  if (subdomain) {
    throw new Error('Cannot register a subdomain using registerName');
  }

  // Create a random address as input to read-only function call
  // Not used by BNS contract function but required by core node API
  // https://github.com/blockstack/stacks-blockchain/blob/master/src/net/http.rs#L1796
  const randomPrivateKey = privateKeyToString(makeRandomPrivKey());
  const randomAddress = getAddressFromPrivateKey(randomPrivateKey);

  return callReadOnlyBnsFunction({
    functionName: bnsFunctionName,
    senderAddress: randomAddress,
    functionArgs: [bufferCVFromString(namespace), bufferCVFromString(name)],
    network,
  }).then((responseCV: ClarityValue) => {
    if (responseCV.type === ClarityType.ResponseOk) {
      return responseCV.value.type === ClarityType.BoolTrue;
    } else {
      return false;
    }
  });
}

/**
 * Get namespace price options
 *
 * @param  {String} namespace - the namespace to get the price of
 * @param  {StacksNetwork} network - the Stacks blockchain network to use
 */
export interface GetNamespacePriceOptions {
  namespace: string;
  network: StacksNetwork;
}

/**
 * Get price of namespace registration in microstacks
 *
 * @param {string} namespace - the namespace
 * @param {StacksNetwork} network - the Stacks network to use
 *
 * @returns {Promise} that resolves to a BN object number of microstacks if the operation succeeds
 */
export async function getNamespacePrice({
  namespace,
  network,
}: GetNamespacePriceOptions): Promise<BN> {
  const bnsFunctionName = 'get-namespace-price';

  // Create a random address as input to read-only function call
  // Not used by BNS contract function but required by core node API
  // https://github.com/blockstack/stacks-blockchain/blob/master/src/net/http.rs#L1796
  const randomPrivateKey = privateKeyToString(makeRandomPrivKey());
  const randomAddress = getAddressFromPrivateKey(randomPrivateKey);

  return callReadOnlyBnsFunction({
    functionName: bnsFunctionName,
    senderAddress: randomAddress,
    functionArgs: [bufferCVFromString(namespace)],
    network,
  }).then((responseCV: ClarityValue) => {
    if (responseCV.type === ClarityType.ResponseOk) {
      if (responseCV.value.type === ClarityType.Int || responseCV.value.type === ClarityType.UInt) {
        return responseCV.value.value;
      } else {
        throw new Error('Response did not contain a number');
      }
    } else if (responseCV.type === ClarityType.ResponseErr) {
      throw new Error(cvToString(responseCV.value));
    } else {
      throw new Error(`Unexpected Clarity Value type: ${getCVTypeString(responseCV)}`);
    }
  });
}

/**
 * Get name price options
 *
 * @param  {String} fullyQualifiedName - the fully qualified name ("name.namespace") to get the price of
 * @param  {StacksNetwork} network - the Stacks blockchain network to use
 */
export interface GetNamePriceOptions {
  fullyQualifiedName: string;
  network: StacksNetwork;
}

/**
 * Get price of name registration in microstacks
 *
 * @param {string} fullyQualifiedName - the fully qualified name
 * @param {StacksNetwork} network - the Stacks network to use
 *
 * @returns {Promise} that resolves to a BN object number of microstacks if the operation succeeds
 */
export async function getNamePrice({
  fullyQualifiedName,
  network,
}: GetNamePriceOptions): Promise<BN> {
  const bnsFunctionName = 'get-name-price';
  const { subdomain, namespace, name } = decodeFQN(fullyQualifiedName);
  if (subdomain) {
    throw new Error('Cannot get subdomain name price');
  }

  // Create a random address as input to read-only function call
  // Not used by BNS contract function but required by core node API
  // https://github.com/blockstack/stacks-blockchain/blob/master/src/net/http.rs#L1796
  const randomPrivateKey = privateKeyToString(makeRandomPrivKey());
  const randomAddress = getAddressFromPrivateKey(randomPrivateKey);

  return callReadOnlyBnsFunction({
    functionName: bnsFunctionName,
    senderAddress: randomAddress,
    functionArgs: [bufferCVFromString(namespace), bufferCVFromString(name)],
    network,
  }).then((responseCV: ClarityValue) => {
    if (responseCV.type === ClarityType.ResponseOk) {
      if (responseCV.value.type === ClarityType.Int || responseCV.value.type === ClarityType.UInt) {
        return responseCV.value.value;
      } else {
        throw new Error('Response did not contain a number');
      }
    } else {
      const errorResponse = responseCV as ResponseErrorCV;
      throw new Error(cvToString(errorResponse.value));
    }
  });
}

/**
 * Preorder namespace options
 *
 * @param  {String} namespace - the namespace to preorder
 * @param  {String} salt - salt used to generate the preorder namespace hash
 * @param  {BN} stxToBurn - amount of STX to burn for the registration
 * @param  {String} publicKey - the private key to sign the transaction
 * @param  {StacksNetwork} network - the Stacks blockchain network to use
 */
export interface PreorderNamespaceOptions {
  namespace: string;
  salt: string;
  stxToBurn: BN;
  publicKey: string;
  network: StacksNetwork;
}

/**
 * Generates a namespace preorder transaction.
 * First step in registering a namespace. This transaction does not reveal the namespace that is
 * about to be registered. And it sets the amount of STX to be burned for the registration.
 *
 * Resolves to the generated StacksTransaction
 *
 * @param  {PreorderNamespaceOptions} options - an options object for the preorder
 *
 * @return {Promise<StacksTransaction>}
 */
export async function buildPreorderNamespaceTx({
  namespace,
  salt,
  stxToBurn,
  publicKey,
  network,
}: PreorderNamespaceOptions): Promise<StacksTransaction> {
  const bnsFunctionName = 'namespace-preorder';
  const saltedNamespaceBuffer = Buffer.from(`${namespace}${salt}`);
  const hashedSaltedNamespace = hash160(saltedNamespaceBuffer);

  return makeBnsContractCall({
    functionName: bnsFunctionName,
    functionArgs: [bufferCV(hashedSaltedNamespace), uintCVFromBN(stxToBurn)],
    publicKey,
    network,
  });
}

/**
 * Reveal namespace options
 *
 * @param  {String} namespace - the namespace to reveal
 * @param  {String} salt - salt used to generate the preorder namespace hash
 * @param  {PriceFunction} priceFunction - an object containing the price function for the namespace
 * @param  {BN} lifeTime - the number of blocks name registrations are valid for in the namespace
 * @param  {String} namespaceImportAddress - the STX address used for name imports
 * @param  {String} publicKey - the private key to sign the transaction
 * @param  {StacksNetwork} network - the Stacks blockchain network to use
 */
export interface RevealNamespaceOptions {
  namespace: string;
  salt: string;
  priceFunction: PriceFunction;
  lifetime: BN;
  namespaceImportAddress: string;
  publicKey: string;
  network: StacksNetwork;
}

/**
 * Generates a namespace reveal transaction.
 * Second step in registering a namespace.
 *
 * Resolves to the generated StacksTransaction
 *
 * @param  {RevealNamespaceOptions} options - an options object for the reveal
 *
 * @return {Promise<StacksTransaction>}
 */
export async function buildRevealNamespaceTx({
  namespace,
  salt,
  priceFunction,
  lifetime,
  namespaceImportAddress,
  publicKey,
  network,
}: RevealNamespaceOptions): Promise<StacksTransaction> {
  const bnsFunctionName = 'namespace-reveal';

  return makeBnsContractCall({
    functionName: bnsFunctionName,
    functionArgs: [
      bufferCVFromString(namespace),
      bufferCVFromString(salt),
      uintCVFromBN(priceFunction.base),
      uintCVFromBN(priceFunction.coefficient),
      uintCVFromBN(priceFunction.b1),
      uintCVFromBN(priceFunction.b2),
      uintCVFromBN(priceFunction.b3),
      uintCVFromBN(priceFunction.b4),
      uintCVFromBN(priceFunction.b5),
      uintCVFromBN(priceFunction.b6),
      uintCVFromBN(priceFunction.b7),
      uintCVFromBN(priceFunction.b8),
      uintCVFromBN(priceFunction.b9),
      uintCVFromBN(priceFunction.b10),
      uintCVFromBN(priceFunction.b11),
      uintCVFromBN(priceFunction.b12),
      uintCVFromBN(priceFunction.b13),
      uintCVFromBN(priceFunction.b14),
      uintCVFromBN(priceFunction.b15),
      uintCVFromBN(priceFunction.b16),
      uintCVFromBN(priceFunction.nonAlphaDiscount),
      uintCVFromBN(priceFunction.noVowelDiscount),
      uintCVFromBN(lifetime),
      standardPrincipalCV(namespaceImportAddress),
    ],
    publicKey,
    network,
  });
}

/**
 * Namespace name import options
 *
 * @param  {String} namespace - the namespace to import name into
 * @param  {String} name - the name to import
 * @param  {String} beneficiary - the address to register the name to
 * @param  {String} zonefileHash - the zonefile hash to register
 * @param  {String} publicKey - the private key to sign the transaction
 * @param  {StacksNetwork} network - the Stacks blockchain network to use
 */
export interface ImportNameOptions {
  namespace: string;
  name: string;
  beneficiary: string;
  zonefile: string;
  publicKey: string;
  network: StacksNetwork;
}

/**
 * Generates a namespace name import transaction.
 * An optional step in namespace registration.
 *
 * Resolves to the generated StacksTransaction
 *
 * @param  {ImportNameOptions} options - an options object for the name import
 *
 * @return {Promise<StacksTransaction>}
 */
export async function buildImportNameTx({
  namespace,
  name,
  beneficiary,
  zonefile,
  publicKey,
  network,
}: ImportNameOptions): Promise<StacksTransaction> {
  const bnsFunctionName = 'name-import';
  const zonefileHash = getZonefileHash(zonefile);

  return makeBnsContractCall({
    functionName: bnsFunctionName,
    functionArgs: [
      bufferCVFromString(namespace),
      bufferCVFromString(name),
      standardPrincipalCV(beneficiary),
      bufferCV(zonefileHash),
    ],
    publicKey,
    network,
    attachment: Buffer.from(zonefile),
  });
}

/**
 * Ready namespace options
 *
 * @param  {String} namespace - the namespace to ready
 * @param  {String} publicKey - the private key to sign the transaction
 * @param  {StacksNetwork} network - the Stacks blockchain network to use
 */
export interface ReadyNamespaceOptions {
  namespace: string;
  publicKey: string;
  network: StacksNetwork;
}

/**
 * Generates a ready namespace transaction.
 * Final step in namespace registration. This completes the namespace registration and
 * makes the namespace available for name registrations.
 *
 * Resolves to the generated StacksTransaction
 *
 * @param  {ReadyNamespaceOptions} options - an options object for the namespace ready transaction
 *
 * @return {Promise<StacksTransaction>}
 */
export async function buildReadyNamespaceTx({
  namespace,
  publicKey,
  network,
}: ReadyNamespaceOptions): Promise<StacksTransaction> {
  const bnsFunctionName = 'namespace-ready';

  return makeBnsContractCall({
    functionName: bnsFunctionName,
    functionArgs: [bufferCVFromString(namespace)],
    publicKey,
    network,
  });
}

/**
 * Preorder name options
 *
 * @param  {String} fullyQualifiedName - the fully qualified name to preorder including the
 *                                        namespace (myName.id)
 * @param  {String} salt - salt used to generate the preorder name hash
 * @param  {BN} stxToBurn - amount of STX to burn for the registration
 * @param  {String} publicKey - the private key to sign the transaction
 * @param  {StacksNetwork} network - the Stacks blockchain network to use
 */
export interface PreorderNameOptions {
  fullyQualifiedName: string;
  salt: string;
  stxToBurn: BN;
  publicKey: string;
  network: StacksNetwork;
}

/**
 * Generates a name preorder transaction.
 * First step in registering a name. This transaction does not reveal the name that is
 * about to be registered. And it sets the amount of STX to be burned for the registration.
 *
 * Resolves to the generated StacksTransaction
 *
 * @param  {PreorderNameOptions} options - an options object for the preorder
 *
 * @return {Promise<StacksTransaction>}
 */
export async function buildPreorderNameTx({
  fullyQualifiedName,
  salt,
  stxToBurn,
  publicKey,
  network,
}: PreorderNameOptions): Promise<StacksTransaction> {
  const bnsFunctionName = 'name-preorder';
  const { subdomain } = decodeFQN(fullyQualifiedName);
  if (subdomain) {
    throw new Error('Cannot preorder a subdomain using preorderName()');
  }
  const saltedNamesBuffer = Buffer.from(`${fullyQualifiedName}${salt}`);
  const hashedSaltedName = hash160(saltedNamesBuffer);

  return makeBnsContractCall({
    functionName: bnsFunctionName,
    functionArgs: [bufferCV(hashedSaltedName), uintCVFromBN(stxToBurn)],
    publicKey,
    network,
  });
}

/**
 * Register name options
 *
 * @param  {String} fullyQualifiedName - the fully qualified name to preorder including the
 *                                        namespace (myName.id)
 * @param  {String} salt - salt used to generate the preorder name hash
 * @param  {String} zonefile - the zonefile to register with the name
 * @param  {String} publicKey - the private key to sign the transaction
 * @param  {StacksNetwork} network - the Stacks blockchain network to use
 */
export interface RegisterNameOptions {
  fullyQualifiedName: string;
  salt: string;
  zonefile: string;
  publicKey: string;
  network: StacksNetwork;
}

/**
 * Generates a name registration transaction.
 * Second and final step in registering a name.
 *
 * Resolves to the generated StacksTransaction
 *
 * @param  {RegisterNameOptions} options - an options object for the registration
 *
 * @return {Promise<StacksTransaction>}
 */
export async function buildRegisterNameTx({
  fullyQualifiedName,
  salt,
  zonefile,
  publicKey,
  network,
}: RegisterNameOptions): Promise<StacksTransaction> {
  const bnsFunctionName = 'name-register';
  const { subdomain, namespace, name } = decodeFQN(fullyQualifiedName);
  if (subdomain) {
    throw new Error('Cannot register a subdomain using registerName()');
  }

  const zonefileHash = getZonefileHash(zonefile);

  return makeBnsContractCall({
    functionName: bnsFunctionName,
    functionArgs: [
      bufferCVFromString(namespace),
      bufferCVFromString(name),
      bufferCVFromString(salt),
      bufferCV(zonefileHash),
    ],
    network,
    publicKey,
    attachment: Buffer.from(zonefile),
  });
}

/**
 * Update name options
 *
 * @param  {String} fullyQualifiedName - the fully qualified name to update including the
 *                                        namespace (myName.id)
 * @param  {String} zonefile - the zonefile to register with the name
 * @param  {String} publicKey - the private key to sign the transaction
 * @param  {StacksNetwork} network - the Stacks blockchain network to use
 */
export interface UpdateNameOptions {
  fullyQualifiedName: string;
  zonefile: string;
  publicKey: string;
  network: StacksNetwork;
}

/**
 * Generates a name update transaction.
 * This changes the zonefile for the registered name.
 *
 * Resolves to the generated StacksTransaction
 *
 * @param  {UpdateNameOptions} options - an options object for the update
 *
 * @return {Promise<StacksTransaction>}
 */
export async function buildUpdateNameTx({
  fullyQualifiedName,
  zonefile,
  publicKey,
  network,
}: UpdateNameOptions): Promise<StacksTransaction> {
  const bnsFunctionName = 'name-update';
  const { subdomain, namespace, name } = decodeFQN(fullyQualifiedName);
  if (subdomain) {
    throw new Error('Cannot update a subdomain using updateName()');
  }
  const zonefileHash = getZonefileHash(zonefile);

  return makeBnsContractCall({
    functionName: bnsFunctionName,
    functionArgs: [bufferCVFromString(namespace), bufferCVFromString(name), bufferCV(zonefileHash)],
    publicKey,
    network,
    attachment: Buffer.from(zonefile),
  });
}

/**
 * Transfer name options
 *
 * @param  {String} fullyQualifiedName - the fully qualified name to transfer including the
 *                                        namespace (myName.id)
 * @param  {String} newOwnerAddress - the recipient address of the name transfer
 * @param  {String} zonefile - the optional zonefile to register with the name
 * @param  {String} publicKey - the private key to sign the transaction
 * @param  {StacksNetwork} network - the Stacks blockchain network to use
 */
export interface TransferNameOptions {
  fullyQualifiedName: string;
  newOwnerAddress: string;
  publicKey: string;
  network: StacksNetwork;
  zonefile?: string;
}

/**
 * Generates a name transfer transaction.
 * This changes the owner of the registered name.
 *
 * Since the underlying NFT will be transferred,
 * you will be required to add a post-condition to this
 * transaction before broadcasting it.
 *
 * Resolves to the generated StacksTransaction
 *
 * @param  {TransferNameOptions} options - an options object for the transfer
 *
 * @return {Promise<StacksTransaction>}
 */
export async function buildTransferNameTx({
  fullyQualifiedName,
  newOwnerAddress,
  zonefile,
  publicKey,
  network,
}: TransferNameOptions): Promise<StacksTransaction> {
  const bnsFunctionName = 'name-transfer';
  const { subdomain, namespace, name } = decodeFQN(fullyQualifiedName);
  if (subdomain) {
    throw new Error('Cannot transfer a subdomain using transferName()');
  }

  const functionArgs = [
    bufferCVFromString(namespace),
    bufferCVFromString(name),
    bufferCVFromString(newOwnerAddress),
  ];

  if (zonefile) {
    functionArgs.push(bufferCV(getZonefileHash(zonefile)));
  }

  return makeBnsContractCall({
    functionName: bnsFunctionName,
    functionArgs,
    publicKey,
    network,
    attachment: zonefile ? Buffer.from(zonefile) : undefined,
  });
}

/**
 * Revoke name options
 *
 * @param  {String} fullyQualifiedName - the fully qualified name to revoke including the
 *                                        namespace (myName.id)
 * @param  {String} publicKey - the private key to sign the transaction
 * @param  {StacksNetwork} network - the Stacks blockchain network to use
 */
export interface RevokeNameOptions {
  fullyQualifiedName: string;
  publicKey: string;
  network: StacksNetwork;
}

/**
 * Generates a name revoke transaction.
 * This revokes a name registration.
 *
 * Resolves to the generated StacksTransaction
 *
 * @param  {RevokeNameOptions} options - an options object for the revoke
 *
 * @return {Promise<StacksTransaction>}
 */
export async function buildRevokeNameTx({
  fullyQualifiedName,
  publicKey,
  network,
}: RevokeNameOptions): Promise<StacksTransaction> {
  const bnsFunctionName = 'name-revoke';
  const { subdomain, namespace, name } = decodeFQN(fullyQualifiedName);
  if (subdomain) {
    throw new Error('Cannot revoke a subdomain using revokeName()');
  }

  return makeBnsContractCall({
    functionName: bnsFunctionName,
    functionArgs: [bufferCVFromString(namespace), bufferCVFromString(name)],
    publicKey,
    network,
  });
}

/**
 * Renew name options
 *
 * @param  {String} fullyQualifiedName - the fully qualified name to renew including the
 *                                        namespace (myName.id)
 * @param  {BN} stxToBurn - amount of STX to burn for the registration
 * @param  {String} publicKey - the private key to sign the transaction
 * @param  {String} newOwnerAddress - optionally choose a new owner address
 * @param  {String} zonefileHash - optionally update the zonefile hash
 * @param  {StacksNetwork} network - the Stacks blockchain network to use
 */
export interface RenewNameOptions {
  fullyQualifiedName: string;
  stxToBurn: BN;
  publicKey: string;
  network: StacksNetwork;
  newOwnerAddress?: string;
  zonefile?: string;
}

/**
 * Generates a name renew transaction.
 * This renews a name registration.
 *
 * Resolves to the generated StacksTransaction
 *
 * @param  {RenewNameOptions} options - an options object for the renew
 *
 * @return {Promise<StacksTransaction>}
 */
export async function buildRenewNameTx({
  fullyQualifiedName,
  stxToBurn,
  newOwnerAddress,
  zonefile,
  publicKey,
  network,
}: RenewNameOptions): Promise<StacksTransaction> {
  const bnsFunctionName = 'name-renewal';
  const { subdomain, namespace, name } = decodeFQN(fullyQualifiedName);
  if (subdomain) {
    throw new Error('Cannot renew a subdomain using renewName()');
  }

  const functionArgs = [
    bufferCVFromString(namespace),
    bufferCVFromString(name),
    uintCVFromBN(stxToBurn),
  ];

  if (newOwnerAddress) {
    functionArgs.push(bufferCVFromString(newOwnerAddress));
  }

  if (zonefile) {
    const zonefileHash = getZonefileHash(zonefile);
    functionArgs.push(bufferCV(zonefileHash));
  }

  return makeBnsContractCall({
    functionName: bnsFunctionName,
    functionArgs,
    publicKey,
    network,
    attachment: zonefile ? Buffer.from(zonefile) : undefined,
  });
}
