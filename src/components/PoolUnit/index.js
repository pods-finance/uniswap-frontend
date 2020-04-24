import React, { useState, useEffect } from 'react'
import { ethers } from 'ethers'
import { withRouter } from 'react-router'
import styled, { keyframes } from 'styled-components'
import { animated, useTransition } from 'react-spring'
import { ChainId, WETH } from '@uniswap/sdk-next'
import { BigNumber } from '@uniswap/sdk'
import { Zero } from 'ethers/constants'

import { useWeb3React, useContract, useExchangeContract, usePrevious, useTotalSupply } from '../../hooks'
import { useAllTokenDetails } from '../../contexts/Tokens'
import { useTransactionAdder } from '../../contexts/Transactions'
import { useAddressAllowance } from '../../contexts/Allowances'
import { useAddressBalance } from '../../contexts/Balances'

import { calculateGasMargin, amountFormatter } from '../../utils'

import Card from '../Card'
import TokenLogo from '../TokenLogo'
import DoubleLogo from '../DoubleLogo'
import Badge from '../Badge'
import Button from '../Button'
import CloseIcon from '../CloseIcon'
import Loader from '../Loader'
import Icon from '../Icon'
import { Link } from '../Link'
import TextBlock from '../Text'

import Lock from '../../assets/images/lock.png'
import MIGRATOR_ABI from '../../constants/abis/migrator'
import { MIGRATOR_ADDRESS } from '../../constants'

const Column = styled.div`
  display: flex;
  flex-direction: column;
`

const Grouping = styled.div`
  display: grid;
  grid-template-columns: auto auto auto 1fr;
  justify-items: start;
  column-gap: 1rem;
  align-items: center;
  height: 40px;
  width: 100%;
  *:last-child {
    justify-self: end;
  }
`

const BottomWrapper = styled.div`
  display: grid;
  width: 100%;
  padding: 5px 0;
  grid-gap: 5px;
  grid-template-columns: auto auto;
  & > div {
    height: fit-content;
  }
`

const FormattedCard = styled(Card)`
  display: grid;
  row-gap: 20px;
  padding: 2rem 1rem;
`

const Row = styled.div`
  display: flex;
  flex-direction: row;
  width: 100%;
  height: 32px;
  justify-content: space-between;
  align-items: center;
`

const InlineSubText = styled.span`
  font-size: 12px;
`

const flash = keyframes`
  0% {}
  50% {
    border: 1px solid #27AE60;
  }
  100% {}
`

const AnimatedCard = styled(Card)`
  animation: ${({ active }) => active && flash};
  animation-duration: 1s;
  animation-iteration-count: infinite;
`

// % above the calculated gas cost that we actually send, denominated in bips
const GAS_MARGIN = ethers.utils.bigNumberify(1000)
const DEFAULT_DEADLINE_FROM_NOW = 60 * 15

function PoolUnit({ token, alreadyMigrated = false, isWETH = false }) {
  // flag for removing this entry after the user confirms
  const [done, setDone] = useState(false)

  const [open, toggleOpen] = useState(false)

  const { account, chainId } = useWeb3React()
  const allTokenDetails = useAllTokenDetails()
  const addTransaction = useTransactionAdder()

  const symbol = allTokenDetails[token].symbol
  const exchangeAddressV1 = allTokenDetails[token].exchangeAddress
  const exchangeAddressV2 = allTokenDetails[token].exchangeAddressV2

  const exchangeContractV1 = useExchangeContract(exchangeAddressV1)
  const migratorContract = useContract(MIGRATOR_ADDRESS, MIGRATOR_ABI)

  const v1Balance = useAddressBalance(account, exchangeAddressV1)
  const v2Balance = useAddressBalance(account, exchangeAddressV2)
  const v2BalancePrevious = usePrevious(v2Balance) // used to see if balance changes

  const tokenAllowance = useAddressAllowance(account, exchangeAddressV1, MIGRATOR_ADDRESS)

  // v1 totalSupply
  const v1TotalSupply = useTotalSupply(exchangeAddressV1)

  // v1 price
  const v1PriceToken = useAddressBalance(!done && !alreadyMigrated && !isWETH ? exchangeAddressV1 : undefined, token)
  const v1PriceETH = useAddressBalance(!done && !alreadyMigrated && !isWETH ? exchangeAddressV1 : undefined, 'ETH')
  const v1Price =
    v1PriceToken && v1PriceETH
      ? v1PriceToken.eq(Zero) || v1PriceETH.eq(Zero)
        ? new BigNumber(0)
        : new BigNumber(v1PriceToken.toString()).div(v1PriceETH.toString())
      : undefined

  // v2 price
  const v2PriceToken = useAddressBalance(!done && !alreadyMigrated && !isWETH ? exchangeAddressV2 : undefined, token)
  const v2PriceETH = useAddressBalance(
    !done && !alreadyMigrated && !isWETH ? exchangeAddressV2 : undefined,
    WETH[chainId].address
  )
  const v2Price =
    v2PriceToken && v2PriceETH
      ? v2PriceToken.eq(Zero) || v2PriceETH.eq(Zero)
        ? new BigNumber(0)
        : new BigNumber(v2PriceToken.toString()).div(v2PriceETH.toString())
      : undefined
  const firstMigrator = v2Price && v2Price.eq(new BigNumber(0))
  const priceDifference =
    !firstMigrator && v1Price
      ? v1Price
          .minus(v2Price)
          .abs()
          .div(v2Price)
      : undefined
  const priceWarning = priceDifference && priceDifference.gte(new BigNumber(0.05)) // .05 = 5%, warning threshold for price differences between v1 and v2
  const priceWarningLarge = priceDifference && priceDifference.gte(new BigNumber(0.15)) // .15 = 15%, warning threshold for large price differences between v1 and v2
  const [pendingApproval, setPendingApproval] = useState(false)
  const approvalDone = tokenAllowance && v1Balance && tokenAllowance.gte(v1Balance)

  const canMigrate = v1TotalSupply && (firstMigrator || v2Price)

  const [pendingMigration, setPendingMigration] = useState(false)
  const migrationDone = v1Balance.eq(Zero) && !v2Balance.eq(Zero)

  const [triggerFlash, setTriggerFlash] = useState(false)

  // reset pending state when on-chain data updates
  useEffect(() => {
    if (approvalDone) {
      setPendingApproval(false)
    }
  }, [approvalDone])

  useEffect(() => {
    if (migrationDone) {
      setPendingMigration(false)
    }
  }, [migrationDone])

  // trigger flash if new v2 liquidity detected
  useEffect(() => {
    if (v2Balance && v2BalancePrevious && !v2Balance.eq(v2BalancePrevious)) {
      setTimeout(() => {
        setTriggerFlash(true)
      }, 500)

      setTimeout(() => {
        setTriggerFlash(false)
      }, 4000)
    }
  }, [v2Balance, v2BalancePrevious])

  const tryApproval = async () => {
    setPendingApproval(true)
    await exchangeContractV1.estimate
      .approve(MIGRATOR_ADDRESS, v1Balance)
      .then(estimatedGasLimit => {
        return exchangeContractV1
          .approve(MIGRATOR_ADDRESS, v1Balance, {
            gasLimit: calculateGasMargin(estimatedGasLimit, GAS_MARGIN)
          })
          .then(response => {
            addTransaction(response, { approval: token })
          })
      })
      .catch(() => {
        setPendingApproval(false)
      })
  }

  const tryMigration = async () => {
    setPendingMigration(true)
    const now = Math.floor(Date.now() / 1000)

    const frontrunningTolerance = 0.005 * 100 * 100 // .5%, in bips
    const v1ValueToken = v1PriceToken.mul(v1Balance).div(v1TotalSupply)
    const v1ValueETH = v1PriceETH.mul(v1Balance).div(v1TotalSupply)

    let amountTokenMin
    let amountETHMin
    if (firstMigrator) {
      amountTokenMin = v1ValueToken
      amountETHMin = v1ValueETH
    } else {
      // how much DAI the V1 ETH is worth at the V2 price
      const projectedTokenValue = v1ValueETH.mul(v2PriceToken).div(v2PriceETH)
      // how much ETH the V1 DAI is worth at the V2 price
      const projectedETHValue = v1ValueToken.mul(v2PriceETH).div(v2PriceToken)
      if (projectedTokenValue.gte(v1ValueToken)) {
        amountTokenMin = v1ValueToken
        amountETHMin = projectedETHValue
      } else {
        amountTokenMin = projectedTokenValue
        amountETHMin = v1ValueETH
      }
    }
    amountTokenMin = amountTokenMin.mul(100 * 100 - frontrunningTolerance).div(100 * 100)
    amountETHMin = amountETHMin.mul(100 * 100 - frontrunningTolerance).div(100 * 100)

    await migratorContract.estimate
      .migrate(token, amountTokenMin, amountETHMin, account, now + DEFAULT_DEADLINE_FROM_NOW)
      .then(estimatedGasLimit => {
        return migratorContract
          .migrate(token, amountTokenMin, amountETHMin, account, now + DEFAULT_DEADLINE_FROM_NOW, {
            gasLimit: calculateGasMargin(estimatedGasLimit, GAS_MARGIN)
          })
          .then(response => {
            addTransaction(response, { migrate: exchangeAddressV1 })
          })
      })
      .catch(() => {
        setPendingMigration(false)
      })
  }

  function DynamicCard() {
    return (
      <>
        <AnimatedCard mt={10} outlined={open} active={triggerFlash}>
          <Grouping>
            {migrationDone ? (
              <DoubleLogo
                size="24px"
                addressTwo={WETH[ChainId.MAINNET].address} // weth has better logo than eth
                addressOne={token}
              />
            ) : (
              <TokenLogo size="24px" address={token} />
            )}
            {migrationDone && v2Balance ? (
              <TextBlock fontSize={20}>
                {Number(amountFormatter(v2Balance, 18, 6)) < 0.00001 ? '<0.00001' : amountFormatter(v2Balance, 18, 6)}{' '}
                {symbol}
                <InlineSubText>/ETH</InlineSubText> Pool Tokens
              </TextBlock>
            ) : (
              v1Balance && (
                <TextBlock fontSize={20}>
                  {Number(amountFormatter(v1Balance, 18, 6)) < 0.00001 ? '<0.00001' : amountFormatter(v1Balance, 18, 6)}{' '}
                  {symbol} Pool Tokens
                </TextBlock>
              )
            )}
            {migrationDone ? <Badge variant="green">V2</Badge> : <Badge variant="yellow">V1</Badge>}
            {!open ? (
              migrationDone ? null : (
                <Button
                  onClick={() => {
                    toggleOpen(true)
                  }}
                >
                  Upgrade
                </Button>
              )
            ) : migrationDone ? (
              <Button
                onClick={() => {
                  setDone(true)
                }}
              >
                Done
              </Button>
            ) : (
              <CloseIcon
                onClick={() => {
                  toggleOpen(false)
                }}
              />
            )}
          </Grouping>
        </AnimatedCard>
        {open && (
          <BottomWrapper>
            {priceWarning && (
              <FormattedCard
                variant={priceWarningLarge ? 'red' : 'yellow'}
                style={{
                  gridColumn: 'span 2',
                  zIndex: -1,
                  paddingTop: '4rem',
                  borderTopLeftRadius: 0,
                  borderTopRightRadius: 0
                }}
                marginTop="-2.5rem"
              >
                <Row>
                  <TextBlock fontSize={14} style={{ maxWidth: '45%', paddingRight: '0.5rem' }}>
                    There is a {priceWarningLarge && 'large'} difference between the V1 and V2 {symbol}/ETH prices. You{' '}
                    {priceWarningLarge ? 'should' : 'may want to'} wait for the prices to stabilize.
                  </TextBlock>
                  <Column style={{ alignItems: 'center', flexShrink: 0 }}>
                    <TextBlock fontWeight={600} color="grey6" marginBottom="0.5rem">
                      V1 Price
                    </TextBlock>
                    <TextBlock fontWeight={600}>{v1Price && v1Price.toPrecision(6)}</TextBlock>
                  </Column>
                  <Column style={{ alignItems: 'center', flexShrink: 0 }}>
                    <TextBlock fontWeight={600} color="grey6" marginBottom="0.5rem">
                      V2 Price
                    </TextBlock>
                    <TextBlock fontWeight={600}>{v2Price && v2Price.toPrecision(6)}</TextBlock>
                  </Column>
                  <Column style={{ alignItems: 'center', flexShrink: 0 }}>
                    <TextBlock fontWeight={600} color="grey6" marginBottom="0.5rem">
                      Difference
                    </TextBlock>
                    <TextBlock
                      fontWeight={600}
                      color={priceWarningLarge ? 'red1' : priceWarning ? 'yellow1' : undefined}
                    >
                      {priceDifference && priceDifference.times(100).toFixed(2)}%
                    </TextBlock>
                  </Column>
                </Row>
              </FormattedCard>
            )}

            <FormattedCard outlined={!approvalDone && 'outlined'}>
              <Row>
                <TextBlock fontSize={20}>Step 1</TextBlock>
                {approvalDone || migrationDone ? (
                  <TextBlock color={'green2'}>✓</TextBlock>
                ) : pendingApproval ? (
                  <Loader />
                ) : (
                  ''
                )}
              </Row>
              <Button
                variant={(approvalDone || migrationDone) && 'success'}
                py={18}
                disabled={pendingApproval || approvalDone || migrationDone}
                onClick={() => {
                  tryApproval()
                }}
              >
                {pendingApproval
                  ? 'Waiting For Confirmation...'
                  : approvalDone || migrationDone
                  ? 'Confirmed'
                  : 'Approve for upgrade'}
              </Button>
              <TextBlock fontSize={16} color={'grey5'}>
                The upgrade helper needs permission to migrate your liquidity.
              </TextBlock>
            </FormattedCard>
            <FormattedCard outlined={approvalDone && 'outlined'}>
              <Row>
                <TextBlock fontSize={20}>Step 2</TextBlock>
                {pendingMigration ? (
                  <Loader />
                ) : migrationDone ? (
                  <TextBlock fontSize={20} color={'green2'}>
                    ✓
                  </TextBlock>
                ) : approvalDone ? (
                  ''
                ) : (
                  <Icon icon={Lock} />
                )}
              </Row>
              <Button
                variant={migrationDone && 'success'}
                disabled={!approvalDone || pendingMigration || migrationDone || !canMigrate}
                py={18}
                onClick={() => {
                  tryMigration()
                }}
              >
                {pendingMigration ? 'Waiting For Confirmation...' : migrationDone ? 'Confirmed' : 'Migrate Liquidity'}
              </Button>
              <TextBlock fontSize={16} color={'grey5'}>
                Your {symbol} liquidity will appear as {symbol}/ETH with a new icon.{' '}
                <Link href="https://uniswap.org/blog/uniswap-v2/" target="_blank" rel="noopener noreferrer">
                  Read more.
                </Link>
              </TextBlock>
            </FormattedCard>
          </BottomWrapper>
        )}
      </>
    )
  }

  function V2Card() {
    return (
      <AnimatedCard mt={10} style={{ opacity: '0.9' }} active={triggerFlash}>
        <Grouping>
          <DoubleLogo
            size="24px"
            addressTwo={WETH[ChainId.MAINNET].address} // weth has better logo than eth
            addressOne={token}
          />
          <TextBlock fontSize={20}>
            {Number(amountFormatter(v2Balance, 18, 6)) < 0.00001 ? '<0.00001 ' : amountFormatter(v2Balance, 18, 6)}{' '}
            {symbol}
            <InlineSubText>/ETH</InlineSubText> Pool Tokens
          </TextBlock>
          <Badge variant="green">V2</Badge>
          <Icon variant="filled" fillColor="green2">
            ✓
          </Icon>
        </Grouping>
      </AnimatedCard>
    )
  }

  function WETHCard() {
    return (
      <AnimatedCard mt={10} style={{ opacity: '0.9' }} active={triggerFlash}>
        <Grouping>
          <TokenLogo size="24px" address={WETH[ChainId.MAINNET].address} />
          <TextBlock fontSize={20}>
            {Number(amountFormatter(v1Balance, 18, 6)) < 0.00001 ? '<0.00001' : amountFormatter(v1Balance, 18, 6)} WETH
            Pool Tokens
          </TextBlock>
          <Badge variant="yellow">V1</Badge>
          <Button
            as="a"
            variant="dull"
            cursor="pointer"
            href={`https://v1.uniswap.exchange/remove-liquidity?poolTokenAddress=${WETH[ChainId.MAINNET].address}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            Remove
          </Button>
        </Grouping>
      </AnimatedCard>
    )
  }

  const fadeTransition = useTransition(true, null, {
    from: { opacity: 0 },
    enter: { opacity: 1 },
    leave: { opacity: 0 }
  })

  return fadeTransition.map(
    ({ item, key, props }) =>
      item && (
        <animated.div key={key} style={props}>
          {done ? null : isWETH ? WETHCard() : alreadyMigrated ? V2Card() : DynamicCard()}
        </animated.div>
      )
  )
}

export default withRouter(PoolUnit)
