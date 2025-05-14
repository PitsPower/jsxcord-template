import type { ReactNode } from 'react'
import type { NodeProps } from './component.js'
import type { Container } from './container.js'
import type { Instance } from './instance.js'
import Reconciler from 'react-reconciler'
import { EmptyInstance, TextInstance } from './instance.js'

const SuspenseInstance = Symbol('SuspenseInstance')

const reconciler = Reconciler<
  'node',
  NodeProps<Record<string, unknown>, Instance>,
  Container,
  Instance | EmptyInstance,
  TextInstance,
  typeof SuspenseInstance,
  unknown,
  unknown,
  unknown,
  Record<string, unknown>,
  unknown,
  number,
  -1
>({
  isPrimaryRenderer: true,
  supportsMutation: true,
  supportsPersistence: false,
  supportsHydration: false,

  noTimeout: -1,
  scheduleTimeout: setTimeout,
  cancelTimeout: clearTimeout,

  createInstance(_type, { props, createInstance }) {
    if (createInstance) {
      return createInstance(props)
    }
    else {
      return new EmptyInstance(null)
    }
  },

  createTextInstance(text) {
    return new TextInstance(text)
  },

  appendInitialChild(parentInstance, child) {
    parentInstance.appendChild(child)
  },

  finalizeInitialChildren() {
    return false
  },

  prepareUpdate(_instance, _type, oldProps, newProps) {
    const result: Record<string, unknown> = {}

    for (const key of Object.keys(oldProps.props ?? {})) {
      if (key !== 'children' && oldProps.props[key] !== newProps.props[key]) {
        result[key] = newProps.props[key]
      }
    }

    return Object.keys(result).length === 0 ? null : result
  },

  shouldSetTextContent() {
    return false
  },

  getRootHostContext() {
    return null
  },

  getChildHostContext(parentHostContext) {
    return parentHostContext
  },

  getPublicInstance(instance) {
    return instance
  },

  prepareForCommit() {
    return null
  },

  resetAfterCommit(container) {
    void container.onChange?.()
  },

  preparePortalMount() {
    throw new Error('Function not implemented.')
  },

  getCurrentEventPriority(): Reconciler.Lane {
    throw new Error('Function not implemented.')
  },

  getInstanceFromNode() {
    throw new Error('Function not implemented.')
  },

  beforeActiveInstanceBlur(): void {
    throw new Error('Function not implemented.')
  },

  afterActiveInstanceBlur(): void {
    throw new Error('Function not implemented.')
  },

  prepareScopeUpdate() {
    throw new Error('Function not implemented.')
  },

  getInstanceFromScope() {
    throw new Error('Function not implemented.')
  },

  detachDeletedInstance() {

  },

  clearContainer(container) {
    container.children = []
  },

  appendChildToContainer(container, child) {
    container.children.push(child)
  },

  appendChild(parentInstance, child) {
    parentInstance.appendChild(child)
  },

  insertInContainerBefore(container, child, beforeChild) {
    const index = container.children.findIndex(c => c === beforeChild)
    container.children.splice(index, 0, child)
  },

  insertBefore(parentInstance, child, beforeChild) {
    if (beforeChild === SuspenseInstance) {
      throw new Error('Not implemented')
    }
    parentInstance.appendChildBefore(child, beforeChild)
  },

  removeChildFromContainer(container, child) {
    container.children = container.children.filter(c => c !== child)
  },

  removeChild(parentInstance, child) {
    if (child === SuspenseInstance) {
      throw new Error('Cannot remove SuspenseInstance')
    }
    parentInstance.removeChild(child)
  },

  commitUpdate(instance, updatePayload) {
    instance.data = { ...instance.data, ...updatePayload }
  },

  commitTextUpdate(textInstance, _oldText, newText) {
    textInstance.data = newText
  },

  hideInstance(instance) {
    instance.isHidden = true
  },

  hideTextInstance(textInstance) {
    textInstance.isHidden = true
  },

  unhideInstance(instance) {
    instance.isHidden = false
  },

  unhideTextInstance(textInstance) {
    textInstance.isHidden = false
  },
})

export default {
  render: (element: ReactNode, container: Container) => {
    const root = reconciler.createContainer(
      container,
      0,
      null,
      false,
      false,
      '',
      () => {},
      null,
    )
    reconciler.updateContainer(element, root)
  },
}
