import { Address, BigInt, Bytes } from "@graphprotocol/graph-ts";

import { StakingPoolCreated, EpochEnded, RewardsPaid, Stake as StakeEvent, Unstake, MoveStake, staking as StakingContract } from "../generated/Staking/staking";
import { State, Epoch, Pool, PoolEpoch, Stake, User } from "../generated/schema";

let zeroAddress = Address.fromHexString('0x0000000000000000000000000000000000000000') as Address;
let defaultPoolId = '0x0000000000000000000000000000000000000000000000000000000000000000';

export function handleStakingPoolCreated(event: StakingPoolCreated): void {
	let poolId = event.params.poolId;
	let operator = event.params.operator;

	let pool = new Pool(poolId.toHexString());
	pool.owner = operator;
	pool.save();

	let state = State.load('0');
	let pools = state.pools;
	pools.push(poolId.toHexString());
	state.pools = pools;
	state.save();

	let epochNumber = state.currentEpoch;
	let nextEpochNumber = epochNumber + BigInt.fromI32(1);

	let poolEpochId = poolId.toHexString() + '-' + epochNumber.toString();
	let poolEpoch = new PoolEpoch(poolEpochId);
	poolEpoch.fees = BigInt.fromI32(0);
	poolEpoch.stake = BigInt.fromI32(0);
	poolEpoch.pool = poolId.toHexString();
	poolEpoch.epoch = epochNumber.toString();
	poolEpoch.save();

	let poolEpochNextId = poolId.toHexString() + '-' + nextEpochNumber.toString();
	let poolEpochNext = new PoolEpoch(poolEpochNextId);
	poolEpochNext.fees = BigInt.fromI32(0);
	poolEpochNext.stake = BigInt.fromI32(0);
	poolEpochNext.pool = poolId.toHexString();
	poolEpochNext.epoch = nextEpochNumber.toString();
	poolEpochNext.save();
}

export function handleEpochEnded(event: EpochEnded): void {
	let address = event.address;
	let epochCount = event.params.epoch;
	let totalFeesCollected = event.params.totalFeesCollected;

	let stakingContract = StakingContract.bind(address);

	let state = State.load('0');
	if (!state) {
		state = new State('0');
		state.currentEpoch = BigInt.fromI32(1);
		state.epochs = [];
		state.pools = [
			defaultPoolId,
		];
		state.save();
	}

	let epochNumber = state.currentEpoch;
	let epoch = Epoch.load(epochNumber.toString());
	if (!epoch) {
		epoch = new Epoch(epochNumber.toString());
		epoch.fees = BigInt.fromI32(0);
		epoch.stake = BigInt.fromI32(0);
	}
	epoch.fees = totalFeesCollected;
	epoch.save();

	state.currentEpoch += BigInt.fromI32(1);
	state.epochs.push(epochNumber.toString());
	state.save();


	// next epoch is X
	epochNumber = state.currentEpoch;
	let nextEpochNumber = epochNumber + BigInt.fromI32(1);

	let nextEpoch = new Epoch(nextEpochNumber.toString());
	nextEpoch.fees = BigInt.fromI32(0);
	nextEpoch.stake = BigInt.fromI32(0);
	nextEpoch.save();

	// copy all stake balances from X to X+1
	let pools = state.pools;
	for (let i = 0; i < pools.length; i++) {
		let poolId = pools[i];
		let poolEpochOldId = poolId + '-' + epochNumber.toString();
		let poolEpochOld = PoolEpoch.load(poolEpochOldId);
		if (!poolEpochOld) {
			poolEpochOld = new PoolEpoch(poolEpochOldId);
			poolEpochOld.fees = BigInt.fromI32(0);
			poolEpochOld.stake = BigInt.fromI32(0);
			poolEpochOld.pool = poolId;
			poolEpochOld.epoch = epochNumber.toString();
			poolEpochOld.save();
		}
		let poolEpochNewId = poolId + '-' + nextEpochNumber.toString();
		let poolEpochNew = new PoolEpoch(poolEpochNewId);
		poolEpochNew.fees = BigInt.fromI32(0);
		poolEpochNew.stake = poolEpochOld.stake;
		poolEpochNew.pool = poolId;
		poolEpochNew.epoch = nextEpochNumber.toString();
		poolEpochNew.save();
	}
}

export function handleRewardsPaid(event: RewardsPaid): void {
	let address = event.address;
	let epochNumber = event.params.epoch;
	let poolId = event.params.poolId;
	let membersReward = event.params.membersReward;

	let prevEpochNumber = epochNumber - BigInt.fromI32(1);
	let poolEpochId = poolId.toHexString() + '-' + prevEpochNumber.toString();
	let poolEpoch = PoolEpoch.load(poolEpochId);
	poolEpoch.fees = membersReward;
	poolEpoch.save();
}

export function handleStake(event: StakeEvent): void {
	let staker = event.params.staker;
	let amount = event.params.amount;

	let user = User.load(staker.toHexString());
	if (!user) {
		user = new User(staker.toHexString());
		user.totalStake = BigInt.fromI32(0);
	}
	user.totalStake += amount;
	user.save();

	let defaultPool = Pool.load(defaultPoolId);
	if (!defaultPool) {
		defaultPool = new Pool(defaultPoolId);
		defaultPool.owner = zeroAddress;
		defaultPool.save();
	}

	let defaultPoolStakeId = staker.toHexString() + '-' + defaultPoolId;
	let defaultPoolStake = Stake.load(defaultPoolStakeId);
	if (!defaultPoolStake) {
		defaultPoolStake = new Stake(defaultPoolStakeId);
		defaultPoolStake.user = staker.toHexString();
		defaultPoolStake.pool = defaultPoolId;
		defaultPoolStake.amount = BigInt.fromI32(0);
	}
	defaultPoolStake.amount += amount;
	defaultPoolStake.save();

	let state = State.load('0');
	let epochNumber = state.currentEpoch;
	let nextEpochNumber = epochNumber + BigInt.fromI32(1);
	let poolEpochId = defaultPoolId + '-' + nextEpochNumber.toString();
	let poolEpoch = PoolEpoch.load(poolEpochId);
	poolEpoch.stake += amount;
	poolEpoch.save();
}

export function handleUnstake(event: Unstake): void {
	let staker = event.params.staker;
	let amount = event.params.amount;

	let user = User.load(staker.toHexString());
	if (!user) {
		user = new User(staker.toHexString());
		user.totalStake = BigInt.fromI32(0);
	}
	user.totalStake -= amount;
	user.save();

	let defaultPoolStakeId = staker.toHexString() + '-' + defaultPoolId;
	let defaultPoolStake = Stake.load(defaultPoolStakeId);
	if (!defaultPoolStake) {
		defaultPoolStake = new Stake(defaultPoolStakeId);
		defaultPoolStake.user = staker.toHexString();
		defaultPoolStake.pool = defaultPoolId;
		defaultPoolStake.amount = BigInt.fromI32(0);
	}
	defaultPoolStake.amount -= amount;
	defaultPoolStake.save();

	let state = State.load('0');
	let epochNumber = state.currentEpoch;
	let nextEpochNumber = epochNumber + BigInt.fromI32(1);
	let poolEpochId = defaultPoolId + '-' + nextEpochNumber.toString();
	let poolEpoch = PoolEpoch.load(poolEpochId);
	poolEpoch.stake -= amount;
	poolEpoch.save();
}

export function handleMoveStake(event: MoveStake): void {
	let staker = event.params.staker;
	let amount = event.params.amount;
	let fromPool = event.params.fromPool;
	let toStatus = event.params.toStatus;
	let toPool = event.params.toPool;

	let fromPoolStakeId = staker.toHexString() + '-' + fromPool.toHexString();
	let fromPoolStake = Stake.load(fromPoolStakeId);
	if (!fromPoolStake) {
		fromPoolStake = new Stake(fromPoolStakeId);
		fromPoolStake.user = staker.toHexString();
		fromPoolStake.pool = fromPool.toHexString();
		fromPoolStake.amount = BigInt.fromI32(0);
	}
	fromPoolStake.amount -= amount;
	fromPoolStake.save();

	let toPoolStakeId = staker.toHexString() + '-' + toPool.toHexString();
	let toPoolStake = Stake.load(toPoolStakeId);
	if (!toPoolStake) {
		toPoolStake = new Stake(toPoolStakeId);
		toPoolStake.user = staker.toHexString();
		toPoolStake.pool = toPool.toHexString();
		toPoolStake.amount = BigInt.fromI32(0);
	}
	toPoolStake.amount += amount;
	toPoolStake.save();


	let state = State.load('0');
	let epochNumber = state.currentEpoch;
	let nextEpochNumber = epochNumber + BigInt.fromI32(1);

	let fromPoolEpochId = fromPool.toHexString() + '-' + nextEpochNumber.toString();
	let fromPoolEpoch = PoolEpoch.load(fromPoolEpochId);
	fromPoolEpoch.stake -= amount;
	fromPoolEpoch.save();

	let toPoolEpochId = toPool.toHexString() + '-' + nextEpochNumber.toString();
	let toPoolEpoch = PoolEpoch.load(toPoolEpochId);
	toPoolEpoch.stake += amount;
	toPoolEpoch.save();
}
